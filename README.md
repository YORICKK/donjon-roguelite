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
- **Carte** : chaque niveau a plusieurs étages de 2-3 portes (combat, élite, piège, trésor, autel, rencontre, repos, marchand, inconnu) puis le boss. Après chaque salle, le groupe vote la porte suivante ; la mini-carte montre les chemins possibles.
- **Combat** : l'ennemi annonce son **intention** avant le vote : *attaque* (frappe si votre action échoue), *coup puissant* (frappe même si vous réussissez, sauf si vous **levez la garde**), *se protège* (DD +4 ce tour), *attaque empoisonnée*, *rage* (+2 dégâts). On revote jusqu'à la mort de l'ennemi ou la fuite (impossible contre un boss). Les boss deviennent furieux à mi-vie. Les **élites** ont plus de PV et frappent plus fort, mais rapportent double or/XP et un meilleur butin.
- **États** : poison (−2 PV par tour pendant 3 tours), béni (+2 à tous les jets), maudit (−1 à tous les jets jusqu'à purification à un autel).
- **Événements** : 36 événements (pièges, trésors, autels, rencontres, repos), dont certains propres à un biome. Certains choix sont réservés à une classe (le voleur crochète, le mage contre un sort, le clerc bénit), d'autres coûtent de l'or ou un objet, ou n'apparaissent que si le groupe est maudit ou empoisonné. Certains s'enchaînent (une porte scellée mène à une salle oubliée, une fontaine à une vision).
- **Fils rouges** : des choix ont des conséquences plus tard dans le run : un prisonnier libéré ou un apprenti épargné surgit contre le boss (−20 % PV), une offrande à la déesse soigne le groupe à l'arrivée chez le boss, une carte ou une vision révèle les portes « inconnues ». Un même run ne propose pas deux fois le même événement.
- **Or et sac** : l'or (gagné en combat, coffres, fouilles) s'achète chez le marchand : potions de soin, bombes, eau bénite, parchemins de fuite, et un objet permanent. Les consommables se votent comme une action. L'or est perdu à la fin du run.
- **Niveaux du groupe** : l'XP (combats, réussites) fait monter le groupe de niveau ; chaque joueur choisit alors un bonus parmi 3 (stat, PV, dégâts, chance, compétence rechargée), valable jusqu'à la fin du run.
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

9. **Connexion Google** (facultatif) : Authentication > Sign-in method > activez **Google**. Le jeu affiche alors « Continuer avec Google ». Un invité qui se connecte garde sa progression (son compte est lié à Google) ; si ce compte Google existait déjà, les objets de l'invité y sont ajoutés. La progression suit alors le joueur sur tous ses appareils.
10. Relancez `npm run dev` : le badge de l'écran d'accueil passe à « En ligne (Firebase) ».
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
- Les personnages sont articulés en pièces rigides (pas de peau déformable) : coudes et genoux se plient par segments.

## Kit 3D Blender

L'environnement (dalles, murs en pierre, arches, piliers, torches, plafonds de couloir, coffre,
autel, feu de camp, tonneaux, caisses, ossements, gravats, bannières) est modélisé dans
[`blender/dungeon_kit.blend`](blender/dungeon_kit.blend) et exporté en
`public/models/dungeon_kit.glb` (un nœud nommé par pièce, couleurs par sommet). Les ennemis
(collection `Enemies`) sont exportés dans `public/models/enemies.glb`, un nœud `enemy_<id>` par
ennemi de `src/data/events.js` (face vers l'avant, pieds au sol) plus `npc_marchand`. Un nouvel
ennemi sans modèle garde automatiquement une forme simple.
`src/scene/kit.js` le charge, teinte la pierre selon la palette du niveau et instancie murs et dalles.
Si le GLB ne charge pas, la scène retombe sur les formes simples.

**Biomes** : chaque niveau a un thème (`theme` dans `src/data/levels.js`) décrit dans `src/data/themes.js` :
murs, sols, piliers, gros éléments contre les murs, décor des coins, objets flottants et particules d'ambiance.
Les pièces sont dans `public/models/themes.glb` (collection Blender `Themes`) :
Cryptes (murs à niche funéraire, sarcophage, statue, cercueil, stèle, cierges, urne, toiles d'araignée),
Mines (paroi rocheuse, sol de terre, étais avec lanterne, rails, wagonnet, cristaux, minerai, stalagmites),
Sanctuaire (pierre noire à runes lumineuses, dalles gravées, obélisque, brasero, bibliothèque, cristaux, pierres runiques flottantes),
et du mobilier commun (râtelier d'armes, table, couchage) placé selon le type de salle (`ROOM_DRESSING`).
Ajouter un biome = modéliser ses pièces, les exporter dans `themes.glb`, puis ajouter une entrée dans `THEMES`.

Pour modifier une pièce : éditez-la dans Blender (collection `DungeonKit`), gardez son nom et son
origine, puis exportez la collection en glTF binaire (`.glb`), Y en haut, couleurs par sommet
« Active », vers `public/models/dungeon_kit.glb`.

## Personnages et animations

Héros, ennemis et marchand sont construits dans Blender (collections `Characters` et `CharEnemies`,
script réutilisable dans le texte Blender `char_helpers`) comme des pièces rigides articulées.
Chaque articulation est un objet nommé `<modèle>__<articulation>` avec son pivot au niveau du joint :
`hips > torso > head, arm_R > forearm_R > hand_R…, leg_R > shin_R` (droite du personnage = -X dans Blender),
et `body > head, tail, leg_FL…` pour le rat.

Les animations sont décrites comme des données dans `src/scene/anim.js` (repos, marche, attaque,
estoc, sort, prière, coup reçu, mort, victoire) et jouées avec l'`AnimationMixer` de three.js.
`src/scene/fx.js` ajoute projectiles, étincelles et anneaux de soin ; `playResult()` dans
`src/scene/dungeon.js` enchaîne l'action du héros, l'impact, la contre-attaque et les blessures.
Un modèle sans articulations reste jouable (animation procédurale de secours).

## Performances

Mesures sur une salle de combat avec 4 héros (navigateur, mode téléphone) :
501 → **~30-65 appels de dessin**, 315k → **~120-150k triangles**, 17 lumières variables → **8 fixes**.

- **Lumières virtuelles** (`FakeLight` dans `src/scene/dungeon.js`) : salles et objets déclarent leurs lumières,
  un petit pool fixe de vraies lumières (3 sur mobile, 5 sur ordinateur) éclaire la salle courante. Le nombre de
  lumières ne change jamais, donc aucun shader n'est recompilé en changeant de salle.
- **Seules la salle courante et ses voisines sont dessinées.**
- **Fusion au chargement** (`src/scene/kit.js`) : les sous-maillages ordinaires d'un modèle sont fusionnés, la couleur
  du matériau étant cuite dans les couleurs de sommets ; matériaux en simple face (Blender exporte en double face).
- **Personnages en un seul maillage** à squelette rigide (`skinCharacters`) : 4 héros = 6 appels de dessin au lieu de 105.
- **Résolution adaptative** : baisse sous 40 i/s, remonte quand c'est fluide (plancher ×1). Pas d'antialiasing ni
  d'ombres sur mobile.
- **Compteur** : ajouter `?fps` à l'adresse (ex. `https://roguelite-d1977.web.app/?fps`) pour afficher images/s,
  appels de dessin, triangles, lumières et résolution, y compris sur téléphone.
- Les modèles sont compressés à l'envoi par Firebase Hosting (~440 Ko transférés pour 4,6 Mo de fichiers).
