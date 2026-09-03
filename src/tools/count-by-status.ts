import { prisma } from "../db.js";
import { COMPANY_ID } from "../context.js";

// ============================================================================
// COMPTAGE PAR STATUT — ÉTAPE 5 DU CYCLE
// ============================================================================
// 💡 POURQUOI CET OUTIL N'A AUCUN PARAMÈTRE, ET POURQUOI C'EST DÉLIBÉRÉ.
//
// La tentation serait d'écrire countByStatus(status: "pending"). Trois raisons
// de ne pas le faire :
//
//   1. UN SEUL APPEL SUFFIT. groupBy renvoie tous les statuts d'un coup. Avec
//      un paramètre, le modèle ferait trois allers-retours pour répondre à
//      "fais-moi un point sur les dossiers" — plus lent, plus cher en tokens.
//
//   2. MOINS DE PARAMÈTRES, MOINS DE SURFACE D'ATTAQUE. Chaque champ qu'un
//      modèle remplit est un champ qu'une injection peut détourner. Zéro
//      paramètre, zéro détournement possible.
//
//   3. LE MODÈLE NE PEUT PAS SE TROMPER DE VALEUR. Il n'a pas à deviner si la
//      convention de ta base est "pending", "PENDING" ou "en_attente".
//
// 🔒 CET OUTIL NE PEUT RIEN FUITER D'EXPLOITABLE. Il renvoie des entiers
// agrégés — aucun nom, aucun identifiant, aucune donnée personnelle. C'est le
// type d'outil le plus sûr qu'on puisse exposer, et c'est aussi celui qui
// répond à la question la plus fréquente d'un compliance officer.

// ============================================================================
// LE SCHÉMA D'ENTRÉE : VIDE
// ============================================================================
// 💡 Un objet vide, pas une absence. Le SDK le traduit en JSON Schema sans
// aucune propriété, ce qui indique explicitement au modèle qu'il n'a rien à
// remplir. C'est plus clair pour lui qu'un schéma manquant.
export const countByStatusInput = {};

export async function countByStatus(): Promise<string> {
  // 💡 groupBy demande à POSTGRES de faire le regroupement et le comptage.
  // Aucune ligne ne remonte jusqu'à Node : on reçoit une poignée de paires
  // (statut, compte). C'est vrai même avec un million de dossiers en base.
  //
  // C'est la différence fondamentale avec un findMany suivi d'un comptage en
  // JavaScript : ici la donnée personnelle ne quitte jamais la base.
  const groupes = await prisma.verificationRequest.groupBy({
    // Regrouper par la colonne status.
    by: ["status"],

    // 🔒 LE CLOISONNEMENT, ICI COMME PARTOUT.
    // Sans cette ligne, cet outil compterait les dossiers de TOUTES les
    // entreprises. Un compteur global est une fuite : savoir qu'un concurrent
    // a 4000 dossiers en attente est une information commerciale.
    where: { companyId: COMPANY_ID },

    // _all compte toutes les lignes du groupe, y compris celles dont certains
    // champs sont null. C'est ce qu'on veut ici.
    _count: { _all: true },

    // Ordre stable : la sortie ne change pas d'un appel à l'autre.
    orderBy: { status: "asc" },
  });

  if (groupes.length === 0) {
    // ⚠️ Message explicite, comme dans find_customer. Un tableau vide
    // laisserait le modèle interpréter — et interpréter, c'est inventer.
    return "Cette entreprise n'a aucun dossier de vérification enregistré.";
  }

  const total = groupes.reduce((somme, g) => somme + g._count._all, 0);

  const lignes = groupes.map((g) => `- ${g.status} : ${g._count._all}`);

  // 💡 On donne le total explicitement plutôt que de laisser le modèle
  // additionner. Il en est capable, mais pourquoi lui laisser l'occasion de se
  // tromper sur une chose que Postgres nous a déjà donnée ?
  return `Répartition des ${total} dossiers de cette entreprise par statut :\n${lignes.join("\n")}`;
}