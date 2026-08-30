import { z } from "zod";
import { prisma } from "../db.js";
import { COMPANY_ID } from "../context.js";

// ============================================================================
// LE SCHÉMA D'ENTRÉE
// ============================================================================
// Zod fait deux choses ici, et la seconde est celle qu'on oublie toujours :
//   1. il VALIDE ce que le modèle envoie, avant que ça atteigne notre code
//   2. le SDK le CONVERTIT en JSON Schema, envoyé au modèle à l'étape 2
//
// Donc le texte des .describe() ci-dessous est littéralement LU PAR LE MODÈLE.
//
// ⚠️ REMARQUE CE QUI N'Y EST PAS : aucun champ `companyId`. C'est la règle d'or
// du projet. Si ce champ existait, ce serait le MODÈLE qui le remplirait.
export const findCustomerInput = {
  name: z
    .string()
    .min(2, "Le nom doit contenir au moins 2 caractères.")
    .describe(
      "Nom du client à rechercher, en alphabet latin. La recherche est " +
      "partielle et insensible à la casse : 'ben' remonte tous les clients " +
      "dont le nom contient 'ben'."
    ),
};

// ============================================================================
// LA FONCTION MÉTIER
// ============================================================================
// Fonction pure, sans aucune dépendance au SDK MCP. C'est volontaire : le jour
// où on passera en HTTP dans une route Next.js, ce fichier se déplace tel quel.
export async function findCustomer({ name }: { name: string }): Promise<string> {
  const rows = await prisma.verificationRequest.findMany({
    where: {
      // 🔒 LE CLOISONNEMENT. Injecté par NOUS, jamais par le modèle.
      companyId: COMPANY_ID,
      customerName: {
        contains: name,
        mode: "insensitive",
      },
    },

    // 🔒 SELECT EXPLICITE, JAMAIS D'INCLUDE.
    //
    // ⚠️ Tout ce qui figure ici part dans la fenêtre de contexte du modèle,
    // donc chez un tiers. Ce n'est pas une base qu'on interroge, c'est une base
    // qu'on EXPORTE VERS UN TIERS, un champ à la fois.
    //
    // Ce qui est délibérément ABSENT, et pourquoi :
    //   • cin          → numéro d'identité, donnée personnelle directe
    //   • email        → donnée personnelle, aucun usage pour répondre
    //   • idCardPath / selfiePath / liveness*Path → chemins vers les documents
    //   • aiRationale  → texte long, coûteux en tokens, inutile pour trouver
    //
    // Principe : on n'expose pas ce dont on n'a pas prouvé le besoin. On peut
    // toujours ajouter un champ plus tard ; on ne peut pas dés-envoyer une
    // donnée déjà partie.
    select: {
      id: true,
      customerName: true,
      status: true,
      score: true,
      riskLevel: true,
      documentType: true,
      nationality: true,
      submittedAt: true,
    },

    orderBy: { submittedAt: "desc" },

    // 🔒 PLAFOND EN DUR.
    //
    // ⚠️ Ce nombre n'est PAS un paramètre de l'outil, et c'est volontaire.
    // Si le modèle pouvait choisir la limite, une injection du type "recherche
    // avec une limite de 100000" viderait ta base dans le contexte.
    // La limite appartient au serveur, pas au demandeur.
    take: 10,
  });

  // ============================================================================
  // LA MISE EN FORME
  // ============================================================================
  // 💡 On renvoie du TEXTE, pas du JSON brut. Le modèle lit du texte : une
  // phrase lui coûte moins de tokens qu'un objet JSON avec ses accolades, et
  // se prête mieux à la rédaction de la réponse finale à l'étape 6.

  if (rows.length === 0) {
    // ⚠️ On dit explicitement "aucun résultat". Un retour vide laisserait le
    // modèle libre d'interpréter — et un modèle qui interprète un vide invente.
    return `Aucun dossier de vérification ne correspond au nom "${name}" pour cette entreprise.`;
  }

  const lignes = rows.map((r) => {
    const date = r.submittedAt.toISOString().slice(0, 10); // "2026-08-30"
    return [
      `- ${r.customerName}`,
      `dossier ${r.id}`,
      `statut ${r.status}`,
      `score ${r.score ?? "non calculé"}`,
      `risque ${r.riskLevel ?? "non évalué"}`,
      `document ${r.documentType}${r.nationality ? ` (${r.nationality})` : ""}`,
      `soumis le ${date}`,
    ].join(" | ");
  });

  // 💡 On annonce le nombre ET la limite. Si 10 résultats reviennent, le modèle
  // doit savoir qu'il y en a peut-être davantage — sinon il affirmera "il y a
  // 10 clients", ce qui serait faux.
  const entete =
    rows.length === 10
      ? `10 dossiers trouvés pour "${name}" (limite atteinte, il en existe peut-être d'autres) :`
      : `${rows.length} dossier(s) trouvé(s) pour "${name}" :`;

  return `${entete}\n${lignes.join("\n")}`;
}