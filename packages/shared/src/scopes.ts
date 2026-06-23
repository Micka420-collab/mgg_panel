/**
 * Granular permission scopes. Used both for sub-user permissions on a server
 * and for API key scopes (launcher / automation tokens).
 */
export const SCOPES = {
  // Control
  "control.console": "View the server console",
  "control.command": "Send commands to the console",
  "control.start": "Start the server",
  "control.stop": "Stop / restart / kill the server",
  // Files
  "file.read": "Browse and read files",
  "file.write": "Create and edit files",
  "file.delete": "Delete files",
  "file.archive": "Compress / decompress files",
  "file.sftp": "Connect over SFTP",
  // Backups
  "backup.read": "View backups",
  "backup.create": "Create backups",
  "backup.restore": "Restore backups",
  "backup.delete": "Delete backups",
  // Allocations / network
  "allocation.read": "View network allocations",
  "allocation.update": "Change the primary allocation",
  // Startup / settings
  "startup.read": "View startup variables",
  "startup.update": "Change startup variables",
  "settings.rename": "Rename the server",
  "settings.reinstall": "Reinstall the server",
  // Schedules
  "schedule.read": "View scheduled tasks",
  "schedule.update": "Create / edit scheduled tasks",
  // Sub-users
  "subuser.read": "View sub-users",
  "subuser.update": "Manage sub-users",
  // Players
  "players.read": "View the player list",
  "players.manage": "Op / ban / whitelist players",
} as const;

export type Scope = keyof typeof SCOPES;

export const ALL_SCOPES = Object.keys(SCOPES) as Scope[];

/** Owners implicitly hold every scope. */
export const OWNER_SCOPES: readonly Scope[] = ALL_SCOPES;

/** Human category labels for grouping scopes in the UI (keyed by the scope prefix). */
export const SCOPE_GROUP_LABELS: Record<string, string> = {
  control: "Puissance & console",
  file: "Fichiers",
  backup: "Sauvegardes",
  allocation: "Réseau",
  startup: "Démarrage",
  settings: "Réglages",
  schedule: "Planificateur",
  subuser: "Sous-utilisateurs",
  players: "Joueurs",
};

/** Ready-made permission bundles ("roles") for granting sub-user access fast. */
export interface ScopePreset {
  key: string;
  label: string;
  description: string;
  scopes: Scope[];
}
export const SCOPE_PRESETS: ScopePreset[] = [
  { key: "viewer", label: "Lecture seule", description: "Voir console, fichiers, sauvegardes — sans rien modifier", scopes: ["control.console", "file.read", "backup.read", "startup.read", "allocation.read", "schedule.read", "players.read"] },
  { key: "moderator", label: "Modérateur", description: "Console + commandes + gestion des joueurs", scopes: ["control.console", "control.command", "players.read", "players.manage"] },
  { key: "operator", label: "Opérateur", description: "Démarrer/arrêter, fichiers, sauvegardes, planificateur", scopes: ["control.console", "control.command", "control.start", "control.stop", "file.read", "file.write", "backup.read", "backup.create", "backup.restore", "schedule.read", "schedule.update", "players.read"] },
  { key: "trusted", label: "Confiance totale", description: "Toutes les permissions sur ce serveur", scopes: [...ALL_SCOPES] },
];

/** A safe, read-only default for launcher tokens. */
export const LAUNCHER_DEFAULT_SCOPES: readonly Scope[] = [
  "control.console",
  "control.start",
  "control.stop",
  "allocation.read",
  "players.read",
];

export function hasScope(held: readonly string[], required: Scope): boolean {
  return held.includes(required) || held.includes("*");
}
