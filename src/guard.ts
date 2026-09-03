// ============================================================================
// PLAFOND D'APPELS PAR OUTIL — LA CEINTURE DE SÉCURITÉ
// ============================================================================
// ⚠️ POURQUOI CE FICHIER EXISTE : parce qu'une bonne description ne garantit
// rien. Le modèle a lancé onze appels consécutifs à find_customer, fait tomber
// le serveur, et rien dans le code ne l'en empêchait.
//
// 💡 LA DIFFÉRENCE FONDAMENTALE avec les phrases anti-bricolage des
// descriptions : une description PERSUADE le modèle, ce compteur le CONTRAINT.
// La persuasion échoue parfois ; la contrainte, jamais. On garde les deux, mais
// on ne compte que sur la seconde.
//
// C'est le même raisonnement que ton champ `attempts` sur OtpCode : le rate
// limiting mesure un émetteur, ce compteur-ci mesure un comportement.
//
// 💡 Compteur en mémoire du processus, volontairement : en stdio, le processus
// vit le temps de la session du host. Le compteur naît et meurt avec elle, ce
// qui est exactement la portée voulue. Pas de Redis, pas de base, rien à
// synchroniser.

const compteurs = new Map<string, number>();

// 30 appels d'un même outil dans une session : au-delà, ce n'est plus de
// l'usage, c'est une boucle. Un humain n'atteint jamais ce chiffre.
const MAX_PAR_OUTIL = 30;

export function verifierQuota(nomOutil: string): string | null {
  const actuel = (compteurs.get(nomOutil) ?? 0) + 1;
  compteurs.set(nomOutil, actuel);

  if (actuel > MAX_PAR_OUTIL) {
    // 💡 On renvoie un TEXTE plutôt que de lever une exception. Une erreur de
    // protocole laisserait le modèle libre de réessayer ; une réponse claire
    // lui dit explicitement d'arrêter et pourquoi.
    return (
      `Limite atteinte : l'outil ${nomOutil} a déjà été appelé ${MAX_PAR_OUTIL} fois ` +
      `dans cette session. Arrête d'appeler cet outil et explique à l'utilisateur ` +
      `que sa question nécessite un outil différent ou une requête plus précise.`
    );
  }

  return null;
}