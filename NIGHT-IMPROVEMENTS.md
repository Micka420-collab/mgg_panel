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

### ⚠️ Incident disque (résolu)
Disque VM à **100%** (mes builds répétés DOCKER_BUILDKIT=0 → 30 GB d'images orphelines + 22 GB de cache). Purgé → **48% (50 GB libres)**. Probablement la cause du prospect Icarus qui ne se chargeait pas (disque plein = save impossible). **Correctif permanent** : `docker image prune -f` intégré après chaque build nocturne.

### Lot 3 — Score de santé + skeletons
- **Score de santé** serveur (`server-detail.tsx`) : badge vert « Bonne santé » / ambre « Charge élevée » / rouge « Critique » dans l'en-tête, calculé en direct depuis CPU / RAM / latence. Vue d'un coup d'œil que les autres panels n'ont pas.
- **Skeletons de chargement** sur les tuiles de stats (shimmer au lieu de « — » pendant le chargement).

### Lot 4 — Macros de commandes (console)
- **Barre de macros** dans la console (`console-panel.tsx`) : enregistre tes commandes favorites en boutons cliquables (ex. « say Redémarrage dans 5 min », « list », « weather clear »), persistées par serveur (localStorage). 1 clic = exécution. Atout power-user que les autres panels n'ont pas.

### Lot 5 — Favoris dashboard
- **`server-grid.tsx`** : sur le tableau de bord, ⭐ épingle un serveur en favori → il remonte en haut de la liste (persisté localStorage). Étoile au survol des cartes. Utile dès qu'on gère plusieurs serveurs. Page dashboard refactorisée (cartes extraites en composant client).

### Lot 6 — Polish (toasts + fil d'ariane)
- **Bouton fermer (×)** sur les notifications toast (`confirm.tsx`) — dismiss manuel + `aria-label`.
- **Fil d'ariane** sur la page serveur (`server-detail.tsx`) : « Serveurs / NomDuServeur » au lieu du simple lien retour → contexte plus clair.

### Lot 7 — Badge d'alertes live
- **`alerts-badge.tsx`** : pastille rouge sur le menu **Admin** (sidebar) avec le nombre d'alertes non résolues, rafraîchie toutes les 30 s. Met en valeur le feed sécurité / lag / bilans IA construit cette nuit, repérable d'un coup d'œil. Admin uniquement.

### Lot 8 — Suggestions de commandes (console)
- **Suggestions de commandes** dans la console (`console-panel.tsx`) : pendant la frappe, une rangée de commandes courantes correspondant au préfixe apparaît (list, say, weather clear, difficulty…). Clic = remplit l'input. Découvrabilité pour les nouveaux admins, sans gêner l'historique ↑↓.

### Lot 9 — Barres d'usage sur les tuiles
- **Barres de progression** sous les tuiles CPU / RAM / Disque (`server-detail.tsx`) : visuel instantané du % d'utilisation (cyan < 75 %, ambre < 90 %, rouge ≥ 90 %). On voit en un coup d'œil ce qui sature.

### Lot 10 — États vides soignés
- **Composant `EmptyState`** réutilisable (icône + titre + texte) appliqué aux panneaux **Sauvegardes** et **Planifications** : « rien ici » devient un état soigné et localisé au lieu d'un texte gris brut. Le genre de détail qui fait pro.
