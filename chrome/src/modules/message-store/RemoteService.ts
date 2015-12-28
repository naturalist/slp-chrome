/// <reference path="../../../typings/chrome/chrome.d.ts" />
/// <reference path="../../../typings/openpgp/openpgp.d.ts" />
/// <reference path="../message-store.ts" />
/// <reference path="../interfaces.ts" />

module MessageStore {

    export class RemoteService implements Interface {
        url: string;
        path: string;

        constructor(config: any) {
            this.url = config.url;
            this.path = config.path;
        }

        save(armored: string, callback: MessageIdCallback): void {
            var r: XMLHttpRequest,
                json: { id: string };

            r = new XMLHttpRequest();
            r.open('POST', this.url + this.path, true);
            r.onreadystatechange = function() {
                if (r.readyState == 4) {
                    if (r.status != 201) {
                        console.log(r); // TODO: error
                        return;
                    }
                    json = JSON.parse(r.responseText);   
                    callback(json.id);
                }
            }
            r.setRequestHeader('Content-Type', 'application/json');
            r.send(JSON.stringify({armor: armored}));
        }

        load(id: string, callback: MessageCallback): void {
            var r: XMLHttpRequest,
                json: { armored: string };

            r = new XMLHttpRequest();
            r.open('GET', this.getURL(id), true);
            r.onreadystatechange = function() {
                if (r.readyState != 4) {
                    if (r.status != 200) {
                        console.log(r); // TODO: error
                        return;
                    }
                    json = JSON.parse(r.responseText);   
                    callback(json.armored);
                }
            }
            r.setRequestHeader('Content-Type', 'application/json');
            r.send();
        }

        getURL(id: string): string {
            return this.url + this.path + '/' + id;
        }
    }
}
