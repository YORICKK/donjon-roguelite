# Donjon Roguelite

Prototype web d'un jeu de rôle façon Donjons & Dragons, roguelike, en 3D low-poly (three.js).
Le joueur avance de salle en salle et répond à des **choix multiples** résolus par les stats de classe et un **d20**.
Solo ou multijoueur (salon avec code court + lien d'invitation WhatsApp), mort permanente pendant le run,
objets conservés entre les parties.

## Lancer en local

```powershell
npm install
npm run dev
```

Ouvrez http://localhost:5173. Sans configuration Firebase, le jeu tourne en **mode local** :
- solo complet, inventaire sauvegardé dans le navigateur (par pseudo) ;
- multijoueur **entre onglets du même navigateur** (un pseudo différent par onglet), pratique pour tester.

Tests des règles (simulation de centaines de runs) :

```powershell
npm test
```

## Règles du prototype

| Classe | FOR | DEX | INT | SAG | PV | Dégâts | Compétence (1×/run) |
|---|---|---|---|---|---|---|---|
| ⚔️ Guerrier | +3 | +1 | −1 | 0 | 16 | d8 | Coup puissant : réussite auto, dégâts ×2 |
| 🔮 Mage | −1 | 0 | +3 | +1 | 9 | d6 | Boule de feu : 3d6 + INT sans jet |
| 🗡️ Voleur | 0 | +3 | +1 | −1 | 11 | d6 | Mains agiles : piège/coffre réussi sans risque |
| ✨ Clerc | +1 | −1 | 0 | +3 | 13 | d6 | Soin de groupe : 1d8 + SAG à tous |

- **Jet** : d20 + la meilleure valeur du groupe pour la stat testée (ce personnage tente l'action) contre un DD. 20 naturel = critique, 1 = échec critique.
- **Décision de groupe** : vote majoritaire, 30 s par vote. Égalité : le vote de l'hôte l'emporte s'il fait partie des ex æquo. Sans vote : choix au hasard.
- **Combat** : réussite = l'ennemi prend des dégâts ; échec = l'ennemi frappe un membre au hasard. On revote jusqu'à la mort de l'ennemi (ou la fuite, impossible contre un boss).
- **Mort permanente** : un personnage à 0 PV reste mort jusqu'à la fin du run (il regarde). Groupe entier mort = défaite.
- **Butin** : victoire = chaque joueur garde tout le butin du run ; défaite = seulement l'objet le plus rare. Jusqu'à 2 objets équipés au début d'un run.
- **Progression** : battre le boss d'un niveau débloque le suivant (choisi par l'hôte dans le salon).

## Architecture

```
src/
  data/        Contenu piloté par les données (ajouter du contenu = éditer ces fichiers)
    classes.js   classes, stats, compétences
    items.js     objets, rareté, tier (niveau minimum de drop)
    levels.js    niveaux : nb de salles, DD, multiplicateur ennemis, tables de butin, palette
    events.js    ennemis, actions de combat, événements (pièges, coffres, autels, PNJ, repos)
  core/
    rng.js       aléatoire déterministe à graine
    engine.js    règles pures : génération du donjon, choix, vote, résolution, butin conservé
  net/
    firebase.js  auth anonyme, Realtime Database (salons), Firestore (profils)
    local.js     même interface en localStorage (mode hors ligne / tests multi-onglets)
  scene/dungeon.js  scène three.js : salles, couloirs, props, caméra qui avance
  main.js      écrans, salon, boucle de l'hôte, sauvegarde du profil
```

**Modèle réseau** : l'état du salon est un seul objet dans `lobbies/{CODE}` (Realtime Database).
Chaque joueur écrit ses propres champs (classe, équipement, prêt, vote). **L'hôte** est autoritaire :
il compte les votes, résout le choix avec le moteur et écrit le nouvel état `game`. Les jets sont
déterministes (graine du run + salle + tour), donc rejouables et testables.

**Profil joueur** : Firestore `players/{uid}` = `{ name, inventory: {itemId: quantité}, unlockedLevel, runs, wins }`.

**Ajouter un niveau plus difficile** : ajoutez une entrée dans `LEVELS` (`dcBonus`, `enemyScale`, `rooms`,
`lootTable`, `enemies`, `boss`) et, si besoin, des ennemis dans `ENEMIES` et des objets de `tier` supérieur
dans `ITEMS`. Les objets des premiers niveaux servent à survivre aux DD et ennemis renforcés des suivants.

## Configurer Firebase

1. Créez un projet sur https://console.firebase.google.com.
2. **Authentication** > Sign-in method > activez **Anonyme**.
3. **Realtime Database** > Créer une base (ex. europe-west1), mode verrouillé.
4. **Firestore Database** > Créer une base, mode production.
5. Paramètres du projet > Vos applications > **Web** (`</>`) > enregistrez l'app, copiez la config.
6. Copiez `.env.example` en `.env.local` et remplissez les valeurs (dont `VITE_FIREBASE_DATABASE_URL`).
7. Installez la CLI et liez le projet :

   ```powershell
   npm install -g firebase-tools
   ```
   ```powershell
   firebase login
   ```
   ```powershell
   firebase use --add
   ```

8. Déployez les règles de sécurité :

   ```powershell
   firebase deploy --only database,firestore:rules
   ```

9. Relancez `npm run dev` : le badge de l'écran d'accueil passe à « En ligne (Firebase) ».
   Pour tester à deux sur la même machine, utilisez une fenêtre privée ou un autre navigateur
   (l'auth anonyme est partagée entre les onglets d'un même navigateur).

## Déployer (Firebase Hosting)

```powershell
npm run build
```
```powershell
firebase deploy --only hosting
```

Le lien d'invitation WhatsApp utilise l'URL courante du site (`https://votre-projet.web.app/?room=CODE`).

## Publier sur GitHub

```powershell
gh repo create donjon-roguelite --private --source . --push
```

(ou créez un dépôt vide sur github.com puis `git remote add origin <url>` et `git push -u origin main`).
`.env.local` est ignoré par git ; la config web Firebase n'est pas un secret, la sécurité repose sur les règles.

## Limites connues du prototype

- Si l'hôte quitte pendant un run, la partie se fige (pas encore de migration d'hôte).
- Les règles Realtime Database autorisent tout joueur authentifié à écrire dans un salon (suffisant pour jouer entre amis, à durcir avant une diffusion publique, par ex. avec des Cloud Functions qui résolvent les votes).
- Les salons ne sont pas nettoyés automatiquement.
- Les ennemis et le PNJ sont encore des formes générées en code (l'environnement vient du kit Blender).

## Kit 3D Blender

L'environnement (dalles, murs en pierre, arches, piliers, torches, plafonds de couloir, coffre,
autel, feu de camp, tonneaux, caisses, ossements, gravats, bannières) est modélisé dans
[`blender/dungeon_kit.blend`](blender/dungeon_kit.blend) et exporté en
`public/models/dungeon_kit.glb` (un nœud nommé par pièce, couleurs par sommet).
`src/scene/kit.js` le charge, teinte la pierre selon la palette du niveau et instancie murs et dalles.
Si le GLB ne charge pas, la scène retombe sur les formes simples.

Pour modifier une pièce : éditez-la dans Blender (collection `DungeonKit`), gardez son nom et son
origine, puis exportez la collection en glTF binaire (`.glb`), Y en haut, couleurs par sommet
« Active », vers `public/models/dungeon_kit.glb`.
