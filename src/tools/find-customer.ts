import { z } from "zod";
import { prisma } from "../db.js";
import { COMPANY_ID } from "../context.js";
import { clean } from "../format.js";


// ============================================================================
// LE SCHÉMA D'ENTRÉE
// ============================================================================
// Zod fait deux choses ici, et la seconde est celle qu'on oublie toujours :
//   1. il VALIDE ce que le modèle envoie, avant que ça atteigne notre code
//   2. le SDK le CONVERTIT en JSON Schema, envoyé au modèle à l'étape 2
//
// Donc le texte du .describe() ci-dessous est littéralement LU PAR LE MODÈLE.
//
// ⚠️ REMARQUE CE QUI N'Y EST PAS : aucun champ `companyId`. C'est la règle d'or
// du projet. Si ce champ existait, ce serait le MODÈLE qui le remplirait.
//
// 💡 SUR LE min(2) : ce n'est PAS une protection de sécurité, et il ne faut pas
// s'y fier comme telle. "ben" fait exactement la même énumération de masse que
// "a". C'est un simple garde-fou contre les requêtes absurdes. Ce qui protège
// réellement, c'est le plafond à 10 résultats plus bas.
export const findCustomerInput = {
  name: z
    .string()
    // ⚠️ CE MESSAGE EST LU PAR LE MODÈLE QUAND LA VALIDATION ÉCHOUE.
    //
    // L'ancien disait "Le nom doit contenir au moins 2 caractères." — ce qui
    // invite littéralement à réessayer avec 2 caractères. C'est ce qui a
    // déclenché le balayage sur "ma", "an", "ar", "ha"...
    //
    // 💡 UN MESSAGE D'ERREUR DOIT ORIENTER, PAS SEULEMENT INTERDIRE. Dire ce
    // qui est interdit laisse le modèle chercher la variante autorisée la plus
    // proche. Dire quoi faire à la place ferme la boucle.
    .min(
      2,
      "Recherche trop courte. Cet outil sert à retrouver une personne dont tu " +
      "connais le nom. Pour obtenir une liste de dossiers, utilise " +
      "list_recent_verifications. Pour un décompte, utilise " +
      "count_verifications_by_status. N'essaie PAS d'autres fragments de lettres."
    )
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

  // ==========================================================================
  // LE FILTRE, EXTRAIT DANS UNE VARIABLE
  // ==========================================================================
  // ⚠️ POURQUOI EXTRAIRE PLUTÔT QUE DUPLIQUER : on fait DEUX requêtes — une
  // pour les lignes, une pour le total. Si on écrivait le `where` deux fois,
  // il suffirait d'en oublier une pour que le compteur porte sur TOUTE la base,
  // toutes entreprises confondues. Une seule définition, un seul companyId.
  const where = {
    // 🔒 LE CLOISONNEMENT. Injecté par NOUS, jamais par le modèle.
    companyId: COMPANY_ID,
    customerName: {
      contains: name,
      // `as const` est nécessaire ici : sans lui, TypeScript infère le type
      // `string` au lieu du littéral "insensitive" que Prisma attend.
      mode: "insensitive" as const,
    },
  };

  // 💡 Promise.all : les deux requêtes partent en parallèle au lieu de
  // s'attendre. Sur une base distante, la latence réseau domine largement le
  // temps de calcul, donc ça divise pratiquement le temps par deux.
  const [rows, total] = await Promise.all([
    prisma.verificationRequest.findMany({
      where,

      // 🔒 SELECT EXPLICITE, JAMAIS D'INCLUDE.
      //
      // ⚠️ Tout ce qui figure ici part dans la fenêtre de contexte du modèle,
      // donc chez un tiers. Ce n'est pas une base qu'on interroge, c'est une
      // base qu'on EXPORTE VERS UN TIERS, un champ à la fois.
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
      // Si le modèle pouvait choisir la limite, une injection du type
      // "recherche avec une limite de 100000" viderait ta base dans le
      // contexte. La limite appartient au serveur, pas au demandeur.
      take: 10,
    }),

    // 🆕 LE TOTAL RÉEL.
    //
    // 💡 count() ne charge AUCUNE ligne : Postgres compte de son côté et
    // renvoie un entier. Le coût est négligeable même sur un million de
    // dossiers, et ça supprime toute ambiguïté pour le modèle.
    prisma.verificationRequest.count({ where }),
  ]);

  // ==========================================================================
  // LA MISE EN FORME
  // ==========================================================================
  // 💡 On renvoie du TEXTE, pas du JSON brut. Le modèle lit du texte : une
  // phrase lui coûte moins de tokens qu'un objet JSON avec ses accolades, et
  // se prête mieux à la rédaction de la réponse finale à l'étape 6.

  if (total === 0) {
    // ⚠️ On dit explicitement "aucun résultat". Un retour vide laisserait le
    // modèle libre d'interpréter — et un modèle qui interprète un vide invente.
    return `Aucun dossier de vérification ne correspond au nom "${name}" pour cette entreprise.`;
  }

  const lignes = rows.map((r) => {
    const date = r.submittedAt.toISOString().slice(0, 10); // "2026-08-30"
    return [
      // ⚠️ clean() sur TOUT champ texte saisi par un humain. L'id, le statut et
      // la date viennent du système : ils sont sûrs et n'en ont pas besoin.
      `- ${clean(r.customerName)}`,
      `dossier ${r.id}`,
      `statut ${r.status}`,
      `score ${r.score ?? "non calculé"}`,
      `risque ${r.riskLevel ?? "non évalué"}`,
      `document ${r.documentType}${r.nationality ? ` (${clean(r.nationality, 30)})` : ""}`,
      `soumis le ${date}`,
    ].join(" | ");
  });

  // 🆕 ON ANNONCE LE TOTAL RÉEL ET CE QU'ON MONTRE.
  //
  // 💡 RÈGLE GÉNÉRALE DE CONCEPTION D'OUTILS MCP : un outil doit toujours dire
  // au modèle CE QU'IL NE LUI MONTRE PAS. Sinon le modèle comble le vide tout
  // seul — et il le comble avec assurance.
  //
  // L'ancienne version disait "il en existe peut-être d'autres", ce qui ne
  // permettait pas de répondre à "combien ?". Maintenant le chiffre est exact.
  const entete =
    total > rows.length
      ? `${total} dossiers correspondent à "${name}". Voici les ${rows.length} plus récents :`
      : `${total} dossier(s) trouvé(s) pour "${name}" :`;

  return `${entete}\n${lignes.join("\n")}`;
}