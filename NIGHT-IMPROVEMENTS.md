# MGG Panel — améliorations nocturnes (autonome)

Session de nuit : améliorer en continu le panel (détails + innovations qui le
démarquent des autres panels). Revue prévue ~6h.

Règles : builds **panel-only** (ne pas couper Icarus live), vérifier chaque
déploiement, revenir en arrière si casse. Lots d'améliorations → 1 build testé.

## Journal

### Lot 1 — Console pro + persistance onglet
- **Console** (`console-panel.tsx`) entièrement repensée :
  - 🔍 Recherche en direct avec **surlignage** des correspondances
  - 🎚️ Filtre par gravité : Tout / Warn+ / Erreurs
  - 📋 **Copier** le journal (filtré) + 📥 **Télécharger en .txt**
  - 🔢 Compteur de lignes (filtré/total), 🔽 bouton « retour en bas », toggle auto-scroll
- **Onglet mémorisé** par serveur (`server-detail.tsx`) — on revient sur l'onglet quitté, plus de reset sur Console.

### Lot 2 — Palette de commandes (Cmd/Ctrl+K)
- **`command-palette.tsx`** : palette globale (⌘K / Ctrl+K) pour sauter vers n'importe quel serveur ou page instantanément (recherche floue, navigation clavier ↑↓ + Entrée, Échap). Aucun panel concurrent (Pterodactyl/Pelican) n'a ça.
- Bouton « Rechercher ⌘K » ajouté dans la sidebar (`shell.tsx`) pour la découvrabilité.
