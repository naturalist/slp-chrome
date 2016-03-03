
module Admin {
    export class PublicKeyImport implements Application.Article {

        filename = "pub_import.html";
        articleId = "publicKeyImport";
        key: string;

        submit(e: Event): void {
            e.preventDefault();

            var publicKey: Keys.PublicKey = null;
            try {
                publicKey = new Keys.PublicKey(this.key);
            } catch (err) {
                app.notify.error = err;
                return;
            }

            try {
                bg.store.addressBook.save(publicKey, () => {
                    bg._ga('admin', 'Import public key');
                    app.notify.info = "Key for " + publicKey.getPrimaryUser() + " added successfully";
                    this.key = "";
                });
            } catch ( err ) {
                app.notify.error = err;
                bg._ga('error', err);
            }
        }
    }
}
