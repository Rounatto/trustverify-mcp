// ============================================================================
// LA CONNEXION À LA BASE
// ============================================================================
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// ⚠️ ATTENTION : `quiet: true` N'EST PAS COSMÉTIQUE, IL EST OBLIGATOIRE.
//
// Les versions récentes de dotenv affichent au chargement un message
// d'information du type "injecting env (2) from .env". Ce message part sur la
// SORTIE STANDARD.
//
// Or en transport stdio, la sortie standard EST le canal du protocole JSON-RPC.
// Ce message s'insérerait au milieu des messages MCP, le host recevrait du JSON
// invalide, et la connexion casserait avec une erreur incompréhensible.
//
// 💡 C'est exactement le piège console.log dont je t'ai parlé — sauf qu'ici il
// vient d'une bibliothèque, pas de ton code. Retiens la leçon générale : en
// stdio, TOUTE dépendance qui écrit sur stdout est un danger.
config({ quiet: true });

// ============================================================================
// L'ADAPTER
// ============================================================================
// 💡 Depuis Prisma 7, le client est du JavaScript pur : il sait CONSTRUIRE des
// requêtes SQL mais plus les ENVOYER. L'adapter est le vrai pilote Postgres,
// celui qui ouvre la connexion TCP et transporte le SQL.
//
// Séparation des rôles :
//   PrismaClient → traduit ton TypeScript en SQL
//   PrismaPg     → envoie ce SQL à Postgres et rapporte les lignes
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

// ============================================================================
// LE CLIENT
// ============================================================================
// Une seule instance pour toute la durée de vie du processus.
//
// 💡 Pourquoi c'est plus simple que dans ton app Next.js : là-bas tu as ce
// contournement du `globalThis` pour éviter que le hot-reload crée cinquante
// connexions. Ici il n'y a pas de hot-reload — Claude Desktop lance le
// processus une fois et le garde vivant tant que l'application est ouverte.
//
// ⚠️ `log: ["error"]` et RIEN DE PLUS. Prisma écrit ses logs sur stdout.
// Activer `log: ["query"]` corromprait chaque message du protocole.
export const prisma = new PrismaClient({
  adapter,
  log: ["error"],
});