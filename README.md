# BeYourCoach
Appli de musculation (PWA) : lit ton historique CSV et recommande ta séance.
Hébergée sur Netlify, déployée automatiquement à chaque modification de ce dépôt.

Photos des exercices : [free-exercise-db](https://github.com/yuhonas/free-exercise-db), domaine public (Unlicense).

## Coach IA
La fonction `netlify/functions/coach.mjs` appelle l'API Anthropic. Variables d'environnement Netlify :
- `ANTHROPIC_API_KEY` (obligatoire, secrète)
- `COACH_ACCESS_CODE` (facultative : code à saisir dans l'appli)
- `ANTHROPIC_MODEL` (facultative, `claude-haiku-5-5` par défaut)
- `COACH_LIMIT_PER_HOUR` (facultative, 30 messages par heure et par adresse par défaut)
