// ============================================================================
// L'IDENTITÉ DU DEMANDEUR — ÉTAPES 4/5 DU CYCLE
// ============================================================================
// ⚠️ CE FICHIER EST LA RAISON POUR LAQUELLE LE MODÈLE NE PEUT PAS FUIR LES
// DONNÉES D'UNE AUTRE ENTREPRISE.
//
// Le companyId arrive par une variable d'environnement, injectée au lancement
// du processus par le host. Il n'apparaît dans AUCUN schéma d'outil, donc le
// modèle ne le voit jamais, ne peut pas le lire, et ne peut pas le modifier —
// même si un texte hostile stocké en base essaie de l'en convaincre.
//
// 💡 C'est le même principe que ta session NextAuth : le companyId vient du
// serveur, jamais du client. Ici, le "client" est le modèle.

const companyId = process.env.TRUSTVERIFY_COMPANY_ID;

if (!companyId) {
  // ⚠️ console.error, JAMAIS console.log — stderr est un canal séparé,
  // capturé par le host dans ses logs sans polluer le protocole.
  console.error(
    "[trustverify-mcp] TRUSTVERIFY_COMPANY_ID est manquant. Arrêt."
  );
  // 💡 FAIL-CLOSED. On plante au démarrage plutôt que de tourner sans identité.
  // Un serveur sans companyId ne pourrait rien filtrer : il vaut infiniment
  // mieux qu'il refuse de démarrer que de démarrer en mode "tout voir".
  // Exactement la même logique que ton AML screening.
  process.exit(1);
}

export const COMPANY_ID: string = companyId;