import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { findCustomerInput, findCustomer } from "./tools/find-customer.js";

// ============================================================================
// 1. LE SERVEUR
// ============================================================================
// `name` et `version` sont échangés pendant le handshake initial, avant tout
// appel d'outil. C'est la carte de visite : le host les affiche dans son
// interface pour que l'utilisateur sache à quoi il est connecté.
const server = new McpServer({
  name: "trustverify",
  version: "0.1.0",
});

// ============================================================================
// 2. LA DÉCLARATION DE L'OUTIL — C'EST ICI L'ÉTAPE 2 DU CYCLE
// ============================================================================
// Quand le host demandera "tools/list", c'est exactement ce bloc qui sera
// sérialisé et envoyé au modèle.
//
// ⚠️ LA DESCRIPTION EST UN PROMPT. Ce n'est pas de la documentation pour un
// humain. C'est la SEULE chose que le modèle lit pour décider s'il appelle cet
// outil. Il ne voit ni ton code, ni ton schéma Prisma, ni ta base.
server.registerTool(
  "find_customer",
  {
    // Titre lisible, affiché dans la popup d'autorisation du host.
    title: "Rechercher un client KYC",

    description: [
      // Phrase 1 — CE QUE ÇA FAIT. Le modèle fait un appariement sémantique
      // entre la question de l'utilisateur et cette phrase.
      "Recherche des dossiers de vérification KYC par nom de client.",

      // Phrase 2 — QUAND L'UTILISER. Sans ça, le modèle hésite ou répond de
      // mémoire. On lui donne les questions déclencheuses.
      "Utilise cet outil pour savoir si une personne a déjà un dossier chez ce client, " +
      "ou pour connaître son statut de vérification, son niveau de risque et sa date de soumission.",

      // Phrase 3 — CE QUE ÇA RENVOIE. Évite que le modèle promette à
      // l'utilisateur des informations que l'outil ne fournit pas.
      "Retourne pour chaque dossier : identifiant, nom, statut (pending, verified, rejected), " +
      "score, niveau de risque, type de document et date de soumission.",

      // Phrase 4 — LES LIMITES. Empêche le modèle d'affirmer un total faux.
      "Maximum 10 résultats, triés du plus récent au plus ancien. " +
      "Ne retourne que les dossiers de l'entreprise connectée.",

      // Phrase 5 — CE QUE ÇA NE FAIT PAS. Le modèle apprend à ne pas espérer
      // obtenir des documents par cet outil, donc à ne pas boucler dessus.
      "Ne donne accès ni aux documents d'identité, ni au numéro de CIN, ni aux coordonnées du client.",
    ].join(" "),

    // Le schéma Zod, converti automatiquement en JSON Schema par le SDK.
    inputSchema: findCustomerInput,
  },

  // ============================================================================
  // 3. LE HANDLER — C'EST ICI L'ÉTAPE 5 DU CYCLE
  // ============================================================================
  // Cette fonction ne s'exécute QUE quand le host décide d'exécuter l'appel,
  // après validation Zod et après autorisation de l'utilisateur.
  async ({ name }) => {
    const texte = await findCustomer({ name });

    // Format imposé par le protocole : une liste de blocs de contenu.
    return {
      content: [{ type: "text", text: texte }],
    };
  }
);

// ============================================================================
// 4. LE BRANCHEMENT DU TRANSPORT
// ============================================================================
// StdioServerTransport branche le serveur sur stdin/stdout. À partir de cet
// instant, la sortie standard appartient au protocole.
const transport = new StdioServerTransport();
await server.connect(transport);

// Sur stderr : invisible du protocole, visible dans les logs du host.
console.error("[trustverify-mcp] serveur démarré, 1 outil exposé");