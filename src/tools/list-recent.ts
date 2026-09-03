import { z } from "zod";
import { prisma } from "../db.js";
import { COMPANY_ID } from "../context.js";
import { clean } from "../format.js";

// ============================================================================
// LISTER LES DOSSIERS RÉCENTS — ÉTAPE 5 DU CYCLE
// ============================================================================
// 💡 POURQUOI CET OUTIL EXISTE : parce que son absence a provoqué une
// énumération. Privé de moyen de lister, le modèle a lancé onze recherches sur
// des fragments de noms pour reconstituer la liste par force brute.
//
// ⚠️ LA LEÇON GÉNÉRALE : un outil manquant ne produit pas un refus poli, il
// produit un contournement. Et le contournement ressemble à une attaque.
//
// 💡 UN SEUL OUTIL, DEUX FILTRES OPTIONNELS, plutôt que trois outils séparés
// (récents / pending / risqués). Trois outils = trois descriptions à écrire,
// trois occasions de se tromper de choix, trois fois plus de tokens dans le
// contexte. Un outil par INTENTION ("montre-moi une liste"), pas par requête.

// ============================================================================
// LES VALEURS AUTORISÉES
// ============================================================================
// ⚠️ z.enum PLUTÔT QUE z.string, ET C'EST IMPORTANT.
// Avec z.string, le modèle devinerait la convention : "pending" ? "PENDING" ?
// "en attente" ? Il se tromperait, recevrait zéro résultat, et réessaierait
// avec une autre orthographe — on retomberait dans la boucle.
// Avec z.enum, les valeurs exactes partent dans le JSON Schema : le modèle les
// LIT au lieu de les deviner, et Zod rejette tout le reste.
const STATUTS = ["pending", "verified", "rejected"] as const;
const NIVEAUX = ["Low", "Medium", "High"] as const;

export const listRecentInput = {
  status: z
    .enum(STATUTS)
    .optional()
    .describe(
      "Filtrer par statut. Omettre pour voir tous les dossiers, tous statuts confondus. " +
      "Utiliser 'pending' pour ne voir que les dossiers en attente d'une décision."
    ),

  riskLevel: z
    .enum(NIVEAUX)
    .optional()
    .describe(
      "Filtrer par niveau de risque. Omettre pour tous les niveaux. " +
      "Utiliser 'High' pour ne voir que les dossiers les plus risqués."
    ),
};

// 🔒 PLAFOND EN DUR, comme dans find_customer.
// ⚠️ Ce n'est PAS un paramètre : si le modèle pouvait choisir la limite, une
// injection du type "liste avec une limite de 100000" viderait la base dans le
// contexte. La limite appartient au serveur, jamais au demandeur.
const LIMITE = 15;

export async function listRecent({
  status,
  riskLevel,
}: {
  status?: (typeof STATUTS)[number];
  riskLevel?: (typeof NIVEAUX)[number];
}): Promise<string> {

  // 💡 Le filtre est construit progressivement : on n'ajoute une clé QUE si le
  // modèle a fourni la valeur. Un `status: undefined` passé à Prisma serait
  // ignoré, mais construire l'objet explicitement rend l'intention lisible.
  const where = {
    // 🔒 LE CLOISONNEMENT, toujours en premier et jamais négociable.
    companyId: COMPANY_ID,
    ...(status ? { status } : {}),
    ...(riskLevel ? { riskLevel } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.verificationRequest.findMany({
      where,
      // 🔒 Mêmes champs que find_customer, ni plus ni moins.
      // Ni cin, ni email, ni chemins de documents, ni aiRationale.
      select: {
        id: true,
        customerName: true,
        status: true,
        score: true,
        riskLevel: true,
        documentType: true,
        submittedAt: true,
      },
      orderBy: { submittedAt: "desc" },
      take: LIMITE,
    }),

    prisma.verificationRequest.count({ where }),
  ]);

  // 💡 On décrit le filtre appliqué dans la réponse elle-même. Sans ça, le
  // modèle qui a demandé les 'pending' pourrait présenter le résultat comme
  // s'il s'agissait de tous les dossiers.
  const filtres = [
    status ? `statut ${status}` : null,
    riskLevel ? `risque ${riskLevel}` : null,
  ].filter(Boolean).join(", ");

  const libelle = filtres ? ` (filtre : ${filtres})` : "";

  if (total === 0) {
    return `Aucun dossier${libelle} pour cette entreprise.`;
  }

  const lignes = rows.map((r) => {
    const date = r.submittedAt.toISOString().slice(0, 10);
    return [
      `- ${clean(r.customerName)}`,
      `dossier ${r.id}`,
      `statut ${r.status}`,
      `score de risque ${r.score ?? "non calculé"}`,
      `risque ${r.riskLevel ?? "non évalué"}`,
      `document ${r.documentType}`,
      `soumis le ${date}`,
    ].join(" | ");
  });

  // 💡 Le total réel, toujours. Un outil doit dire au modèle ce qu'il ne lui
  // montre pas — sinon le modèle comble le vide, et il le comble avec aplomb.
  const entete =
    total > rows.length
      ? `${total} dossiers${libelle}. Voici les ${rows.length} plus récents :`
      : `${total} dossier(s)${libelle} :`;

  return `${entete}\n${lignes.join("\n")}`;
}