# gub-gub-site

For gub the doge

## Dress Up

Try the simple dress-up game at [gub.cam/dress-up](https://gub.cam/dress-up).

## Error logging

Client-side errors and Cloud Function exceptions are stored in the Firebase
Realtime Database for later analysis. You can view them in the Firebase console
under the `logs` node:

- `logs/client` contains issues reported by the browser
- `logs/server` captures errors from backend functions

Database rules restrict log reads to users listed in `/admins` while allowing
any client to write to `logs/client` so that problems can be recorded even
before authentication.
