/// <reference path="../../../../typings/chrome/chrome.d.ts" />
/// <reference path="../../../../typings/openpgp/openpgp.d.ts" />
/// <reference path="../../interfaces.ts" />
/// <reference path="../Messages.ts" />

module MessageStore {

    export class RemoteService implements Interface {
        url: string;
        path: string;

        constructor(config: Config) {
            var c = config.messageStore.remoteService;
            this.url = c.url;
            this.path = c.path;
        }

        save(armor: Messages.ArmorType, callback: IdCallback): void {
            var r: XMLHttpRequest,
                json: Interfaces.Success & { id: Messages.Id };

            r = new XMLHttpRequest();
            r.open('POST', this.url + this.path, true);
            r.onreadystatechange = function() {
                if (r.readyState == 4) {
                    try {
                        json = JSON.parse(r.responseText);
                    } catch (e) {
                        callback({ success: false, error: "No response from server" });
                        return;
                    }

                    if (r.status != 201 || json.error) {
                        callback({
                            success: false,
                            error: json.error || r.responseText || "No response from server"
                        });
                        return;
                    }

                    callback({ success: true, value: json.id });
                }
            }
            r.setRequestHeader('Content-Type', 'application/json');
            r.send(JSON.stringify(armor));
        }

        load(id: Messages.Id, callback: ArmoredCallback): void {
            var r: XMLHttpRequest,
                json: Messages.ArmorType;

            r = new XMLHttpRequest();
            r.open('GET', this.getURL(id), true);
            r.onreadystatechange = function() {
                if (r.readyState == 4) {
                    if (r.status != 200) {
                        callback({ success: false, error: r.responseText });
                        return;
                    }

                    try {
                        json = JSON.parse(r.responseText);
                    } catch (e) {
                        callback({ success: false, error: "Bad server response" })
                    }

                    callback({ success: true, value: new Messages.Armored(json) });
                }
            };

            r.onerror = function(r) {
                console.log(r);
                callback({ success: false, error: "Bad server response" })
            }

            r.setRequestHeader('Content-Type', 'application/json');
            r.send();
        }

        getURL(id: string): string {
            return this.url + this.path + '/' + id;
        }

        getReStr(): string {
            return this.url + this.path + "/([0-9,a-f]+)";
        }
    }
}

