# 🎲 Yams – Feuille de score

Application web (PWA) pour tenir la feuille de score d'une partie de Yams à deux
joueurs. Fonctionne hors‑ligne, s'installe sur tablette ou téléphone comme une
vraie appli, et sauvegarde automatiquement la partie en cours ainsi que
l'historique des 50 dernières parties.

Interface optimisée pour tablette (mise en page 2 colonnes en paysage, cibles
tactiles généreuses), pensée notamment pour la Lenovo Tab / Novo Tab Pro.

## Démo

Une fois GitHub Pages activé : **https://jbpruvot.github.io/Score-Yams/**

## Installer l'application

### Sur tablette / téléphone (Android – Chrome)

1. Ouvrir l'adresse de la démo dans Chrome.
2. Menu **⋮** → **Ajouter à l'écran d'accueil** (ou **Installer l'application**).
3. L'icône apparaît sur l'écran d'accueil ; l'appli s'ouvre en plein écran et
   marche ensuite sans connexion.

### Sur iPad / iPhone (Safari)

1. Ouvrir l'adresse dans Safari.
2. Bouton **Partager** → **Sur l'écran d'accueil**.

### Sur ordinateur (Chrome / Edge)

Icône **Installer** dans la barre d'adresse, ou menu → **Installer Yams…**

## Fonctionnalités

- Saisie rapide des scores (sélecteurs adaptés à chaque combinaison)
- Calcul automatique : sous‑total, bonus (+35 dès 63), totaux et total final
- Barre de progression vers le bonus pour chaque joueur
- Colonne du joueur actif mise en évidence, changement de tour au clavier
  (`←` / `→`) ou automatique après saisie
- Historique des parties + statistiques du jour
- Impression de l'historique
- Sauvegarde automatique (localStorage) et reprise de la partie en cours
- 100 % hors‑ligne grâce au service worker

## Développement local

Aucune dépendance, aucun build. Il suffit de servir le dossier en HTTP
(le service worker exige `http(s)://`, pas `file://`) :

```bash
python -m http.server 8000
# puis ouvrir http://localhost:8000
```

## Déploiement (GitHub Pages)

1. Dépôt : https://github.com/jbpruvot/Score-Yams
2. **Settings → Pages → Build and deployment → Source : Deploy from a branch**.
3. Choisir la branche `main` et le dossier `/ (root)`, puis **Save**.
4. Attendre ~1 minute : l'appli est disponible sur
   **https://jbpruvot.github.io/Score-Yams/**

> Après chaque mise à jour du code, pensez à incrémenter `CACHE_NAME` dans
> [`sw.js`](sw.js) pour que les appareils déjà installés récupèrent la nouvelle
> version.

## Structure

| Fichier          | Rôle                                             |
| ---------------- | ------------------------------------------------ |
| `index.html`     | Structure de la feuille de score                 |
| `style.css`      | Thème, mise en page responsive / tablette        |
| `app.js`         | Logique de jeu, scores, historique, statistiques |
| `sw.js`          | Service worker (cache hors‑ligne)                |
| `manifest.json`  | Métadonnées PWA (nom, icônes, couleurs)          |
| `icon-192.png` / `icon-512.png` | Icônes de l'application            |
