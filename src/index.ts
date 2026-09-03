import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { findCustomerInput, findCustomer } from "./tools/find-customer.js";
import { countByStatusInput, countByStatus } from "./tools/count-by-status.js";
import { listRecentInput, listRecent } from "./tools/list-recent.js";
import { verifierQuota } from "./guard.js";

const server = new McpServer({
  name: "trustverify",
  version: "0.3.0",
});

// ============================================================================
// OUTIL 1 : RECHERCHE PAR NOM
// ============================================================================
server.registerTool(
  "find_customer",
  {
    title: "Rechercher un client KYC",
    description: [
      "Recherche des dossiers de vérification KYC par nom de client.",

      "Utilise cet outil UNIQUEMENT quand tu connais le nom de la personne recherchée.",

      "Retourne pour chaque dossier : identifiant, nom, statut (pending, verified, rejected), " +
      "score de risque, niveau de risque, type de document et date de soumission. " +
      // ⚠️ L'ÉCHELLE DU SCORE, EXPLICITÉE.
      // Sans cette phrase, le modèle voit "score 100 | risque High | rejected"
      // et ne peut pas trancher : 100 = excellent, ou 100 = risque maximal ?
      // Un champ dont l'échelle n'est pas évidente doit être expliqué dans la
      // description, ou ne pas être renvoyé du tout.
      "Le score est un SCORE DE RISQUE : plus il est élevé, plus le dossier est risqué. " +
      "Un score proche de 100 signale un risque maximal, un score proche de 0 un dossier sain.",

      "Affiche au maximum 10 dossiers, les plus récents d'abord, mais indique toujours " +
      "le nombre total de correspondances. Ne retourne que les dossiers de l'entreprise connectée.",

      "Ne donne accès ni aux documents d'identité, ni au numéro de CIN, ni aux coordonnées du client.",

      // ⚠️ LES PHRASES ANTI-ÉNUMÉRATION.
      "N'utilise JAMAIS cet outil pour explorer la base ou reconstituer une liste. " +
      "Ne lance JAMAIS plusieurs recherches sur des fragments de lettres. " +
      "Pour lister des dossiers, utilise list_recent_verifications. " +
      "Pour compter, utilise count_verifications_by_status.",
    ].join(" "),
    inputSchema: findCustomerInput,
  },
  async ({ name }) => {
    // 🔒 Le quota est vérifié AVANT toute requête à la base.
    const bloque = verifierQuota("find_customer");
    if (bloque) return { content: [{ type: "text", text: bloque }] };

    const texte = await findCustomer({ name });
    return { content: [{ type: "text", text: texte }] };
  }
);

// ============================================================================
// OUTIL 2 : COMPTAGE PAR STATUT
// ============================================================================
server.registerTool(
  "count_verifications_by_status",
  {
    title: "Compter les dossiers par statut",
    description: [
      "Compte les dossiers de vérification KYC de l'entreprise, regroupés par statut.",

      "Utilise cet outil pour toute question de VOLUME : combien de dossiers sont en attente, " +
      "combien ont été vérifiés, combien rejetés, ou combien de dossiers l'entreprise possède au total.",

      "Retourne le nombre de dossiers pour chaque statut ainsi que le total. " +
      "Un statut absent de la réponse signifie qu'aucun dossier ne le porte actuellement.",

      "N'utilise JAMAIS find_customer pour compter des dossiers : cet outil-ci donne le chiffre exact, " +
      "alors que find_customer est plafonné à 10 résultats et ne renvoie que des correspondances de nom.",

      "Ne retourne aucun nom de client ni aucune donnée personnelle, uniquement des compteurs.",
    ].join(" "),
    inputSchema: countByStatusInput,
  },
  async () => {
    const bloque = verifierQuota("count_verifications_by_status");
    if (bloque) return { content: [{ type: "text", text: bloque }] };

    const texte = await countByStatus();
    return { content: [{ type: "text", text: texte }] };
  }
);

// ============================================================================
// OUTIL 3 : LISTER LES DOSSIERS RÉCENTS
// ============================================================================
server.registerTool(
  "list_recent_verifications",
  {
    title: "Lister les dossiers récents",
    description: [
      "Liste les dossiers de vérification KYC les plus récents de l'entreprise, " +
      "sans avoir besoin de connaître un nom.",

      // ⚠️ LA PHRASE LA PLUS IMPORTANTE DE CETTE DESCRIPTION.
      // C'est elle qui ferme le trou qui a provoqué l'énumération.
      "Utilise cet outil pour toute demande de vue d'ensemble : 'fais-moi un point sur nos dossiers', " +
      "'montre-moi les derniers dossiers', 'quels dossiers demandent une action', " +
      "'quels sont les dossiers les plus risqués'.",

      "Deux filtres optionnels : status (pending, verified, rejected) et riskLevel (Low, Medium, High). " +
      "Sans filtre, retourne les plus récents tous statuts confondus. " +
      "Avec status='pending', ne retourne que les dossiers en attente de décision. " +
      "Avec riskLevel='High', ne retourne que les dossiers les plus risqués.",

      "Affiche au maximum 15 dossiers, du plus récent au plus ancien, et indique toujours " +
      "le nombre total correspondant au filtre.",

      "Le score est un SCORE DE RISQUE : plus il est élevé, plus le dossier est risqué.",

      "Ne donne accès ni aux documents d'identité, ni au numéro de CIN, ni aux coordonnées du client.",
    ].join(" "),
    inputSchema: listRecentInput,
  },
  async ({ status, riskLevel }) => {
    const bloque = verifierQuota("list_recent_verifications");
    if (bloque) return { content: [{ type: "text", text: bloque }] };

    const texte = await listRecent({ status, riskLevel });
    return { content: [{ type: "text", text: texte }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("[trustverify-mcp] serveur démarré, 3 outils exposés");