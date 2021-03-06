/// <reference path="../typings/tsd.d.ts" />
/// <reference path="modules.d.ts" />

var app: App,
    bg: Interfaces.BackgroundPage = <Interfaces.BackgroundPage>chrome.extension.getBackgroundPage(),
    tab: chrome.tabs.Tab;   // current open tab

var keybase = new API.Keybase();

interface BoolFunc {
    (): boolean;
}

//---------------------------------------------------------------------------
// Sends messages to the active element in the content script of the current tab
//---------------------------------------------------------------------------
function sendElementMessage(msg: Interfaces.ContentMessage<any>, callback?: Interfaces.ResultCallback<any>): void {
    msg.elementLocator = bg.elementLocatorDict[tab.id];
    chrome.tabs.sendMessage(tab.id, msg, callback);
}

function isInArray(item: Keys.KeyItem, array: Keys.KeyItemList): boolean {
    var i: number;
    for (i = 0; i < array.length; i++) {
        var testItem = array[i];
        if ( item.key.fingerprint() == testItem.key.fingerprint())
            return true;
    }

    return false;
}

module Components {
    export class TextInput {
        value: string;
        forceShow: boolean;
        wait: boolean;
        visible: BoolFunc;

        constructor(data: { value: string }) {
            this.value = data.value;
            this.wait = false;
            this.visible = function(): boolean {
                return this.value || this.forceShow;
            }
        }

        show(): void {
            this.forceShow = true;
            document.getElementById('clear-text').focus();
        }

        sendPublicKey(): void {
            this.wait = true;
            bg.encryptPublicKey((result: Interfaces.Success<Messages.UrlType>) => {
                this.wait = false;
                if ( result.success ) {
                    sendElementMessage({ action: 'setElementText', value: result.value }, (result) => {
                        if (result.success) {
                            window.close();
                        } else {
                            app.setError(result.error);
                        }
                    });
                } else {
                    app.setError(result.error);
                }
            })
        }
    }

    export class Expiration {
        value: number;
        show: BoolFunc;

        constructor(data: { value: number }) {
            this.value = data.value;
            this.show = function() {
                return this.value > 0;
            }
        }

        toggle(e: Event): void {
            e.preventDefault();
            this.value = 3600;
        }

    }

}


/*
 * Receprents can not be a Rivets component, because it is not fully self
 * contained. Its attributes leak out into other parts of the browser.html page
 */
class Recepients {
    found: Keys.KeyItemList;
    selected: Keys.KeyItemList;
    filter: string;
    hasFound: BoolFunc;
    hasSelected: BoolFunc;
    wait: boolean;
    searchTimer: number;

    constructor(selected: Keys.KeyItemList) {
        this.found = [];
        this.selected = [];
        this.hasFound = function() {
            return this.found.length > 0
        };
        this.hasSelected = function() {
            return this.selected.length > 0
        };
    }

    // Checks if 'item' is already selected
    private isSelected(item: Keys.KeyItem): boolean {
        return isInArray(item, this.selected);
    }


    private isFound(item: Keys.KeyItem): boolean {
        return isInArray(item, this.found);
    }

    setFromKeys(list: Array<Keys.PublicKey>): void {
        var i: number,
            result: Keys.KeyItemList = [];

        // Move all keys, except own key so it doesn't show up in the list
        for (i = 0; i < list.length; i++) {
            var k = list[i];
            if ( k.fingerprint() != bg.privateKey.fingerprint() ) {
                result.push(new Keys.KeyItem(k))
            }
        }

        this.selected = result;
    }

    forEach(func: { (item: Keys.KeyItem): void }): void {
        this.selected.forEach(func);
    }

    moveToSelected(e: Event, model: {index: number}) {
        var item = this.found[model.index];
        if ( this.isSelected(item) == false ) {
            this.selected.push(item);
            if ( item.isRemote ) {
                bg.store.addressBook.save(item.key, () => {});
            }
        }
        this.filter = "";
        this.found= [];
        this.focus(<MouseEvent>e);
    }

    removeFromSelected(e: Event, model: {index: number}) {
        this.selected.splice(model.index, 1);
    }

    focus(e: MouseEvent): void {
        e.preventDefault();
        e.stopPropagation();
        var el = <HTMLInputElement>document.getElementById('ftr');
        el.focus();
    }

    search(e: KeyboardEvent): void {
        var found: Keys.KeyItemList = [],
            i: number,
            timer;

        if (this.searchTimer) clearTimeout(this.searchTimer);

        // Empty filter cleans out the dropdown
        if ( !this.filter ) {
            this.found = [];
            return;
        }

        // Get keys and move them to the local found array, then into this.found
        var keysToItems = function(keys: Keys.PublicKeyArray, isRemote: boolean): void {
            for (i = 0; i < keys.length; i++) {
                var keyItem = new Keys.KeyItem(keys[i], this.filter);
                keyItem.isRemote = isRemote;
                if ( !this.isSelected(keyItem) && !isInArray(keyItem, found) )
                    found.push(keyItem);
            }
            this.found = found;
        }.bind(this);

        // Search the local address book
        bg.store.addressBook.search(this.filter, (keys) => {
            keysToItems(keys, false);

            // Also search in Keybase, but after a timeout
            if ( bg.preferences.enableKeybase && bg.config.enableKeybase ) {
                this.searchTimer = setTimeout(() => {
                    this.wait = true;
                    keybase.search(this.filter, (keys) => {
                        keysToItems(keys, true);
                        this.wait = false;
                    });
                }, 500);
            }
        });
    }
}

/*
 * The main application handles all articles, bit it itself
 * also handles the private key password entry screen.
 */

class App {

    error: string;
    password: string;
    wait: boolean;

    hasPrivateKey: BoolFunc;
    isDecrypted: BoolFunc;
    alreadyEncrypted: boolean;
    timeToLive: number;
    host: string;

    recepients: Recepients;
    clearText: string;

    showSelection: boolean;

    constructor() {
        this.timeToLive = 0;
        this.recepients = new Recepients([]);

        this.hasPrivateKey = function() {
            return bg.privateKey ? true : false;
        }

        this.isDecrypted = function() {
            return this.hasPrivateKey() ? bg.privateKey.isDecrypted() : false;
        }

        if ( this.isDecrypted() ) {
            chrome.tabs.query({ active: true }, (tabs) => {
                tab = tabs[0];
                this.getElementText();
            })
        }
    }

    private getElementText(): void {
        var lastMessage: Interfaces.LastMessage,
            i: number;

        sendElementMessage({ action: 'getElementText' }, (response: Interfaces.ElementTextMessage) => {
            if ( !response ) return;

            this.clearText = response.value;
            this.alreadyEncrypted = response.isAlreadyEncrypted;
            this.host = response.host;
            lastMessage = response.lastMessage;

            if ( response.selectionRequired && !response.value ) {
                this.showSelection = true;
                return;
            }

            if ( lastMessage ) {

                // Translate last message's fingerprints into keys
                if ( lastMessage.fingerprints.length ) {
                    bg.store.addressBook.load(lastMessage.fingerprints, (keys) => {
                        this.recepients.setFromKeys(keys);
                    });
                }

                // Set the same expiration time
                if ( lastMessage.timeToLive ) {
                    this.timeToLive = lastMessage.timeToLive;
                }
            }

        });
    }

    setError(msg: string): void {
        bg._ga('browser_error', msg);
        this.error = msg;
    }

    close(e: Event) {
        window.close();
    }

    //---------------------------------------------------------------------------
    // Encrypt the message and paste the url back to the textarea
    //---------------------------------------------------------------------------
    sendMessage(e: Event) {
        var keyList: Array<openpgp.key.Key> = [],
            clearMessage: Messages.ClearType;

        // This should never happen because we don't show the submit button
        if (this.recepients.hasSelected() == false) return;

        // Collect a list of keys and fingerprints. The keys are used to encrypt
        // the message, and the fingerprints are saved in the editable so they
        // can be reused again with a shortcut
        this.recepients.forEach((item) => {
            keyList.push(item.key.openpgpKey());
        })

        // The clear message is a record
        clearMessage = {
            body: this.clearText,
            timeToLive: this.timeToLive,
            host: this.host
        };

        this.wait = true;
        bg.encryptMessage(clearMessage, keyList, (result: Interfaces.Success<Messages.UrlType>) => {
            this.wait = false;
            if ( result.success ) {
                sendElementMessage({ action: 'setElementText', value: result.value }, (result) => {
                    if ( result.success ) {
                        window.close();
                    } else {
                        this.setError(result.error);
                    }
                });
            } else {
                this.setError(result.error);
            }
        })
    }

    //---------------------------------------------------------------------------
    // Restore the original message back in the textarea
    //---------------------------------------------------------------------------
    restoreMessage(e: Event) {
        sendElementMessage({ action: 'restoreElementText' }, (result) => {
            if ( result.success ) {
                window.close();
            } else {
                this.setError(chrome.i18n.getMessage("browserGenericError"));
            }
        })
    }

    //---------------------------------------------------------------------------
    // Unlock the private key by providing a password
    //---------------------------------------------------------------------------
    enterPassword(e: KeyboardEvent): void {
        if ( e.keyCode != 13 ) {
            this.error = "";
            return;
        }

        if ( this.password ) {
            this.wait = true;
            if ( bg.unlockKey(this.password) ) {
                window.close();
            } else {
                this.error = chrome.i18n.getMessage("browserBadPassword")
            }
            this.wait = false;
        }
    }

    //---------------------------------------------------------------------------
    // Lock the privateKey
    //---------------------------------------------------------------------------
    lock(): void {
        bg.lockDown();
        window.close();
    }

    //---------------------------------------------------------------------------
    // Go to the settings page
    //---------------------------------------------------------------------------
    goSettings(e: MouseEvent): void {
        bg._ga('browser', 'goSettings');
        chrome.runtime.openOptionsPage(() => {});
    }

    //---------------------------------------------------------------------------
    // Run application
    //---------------------------------------------------------------------------
    run(): void {
        rivets.configure({
            handler: function(target, ev, binding) {
                this.call(binding.model, ev, binding.view.models)
            }
        });

        rivets.bind(document.body, this);

        if (this.isDecrypted() == false) {
            document.getElementById('pwd').focus();
        }

        bg._ga('browser', 'run');

    }
}

function loadComponents(): void {
    var els = document.querySelectorAll('script[type="text/template"]');

    [].forEach.call(els, (el: HTMLElement) => {
        var name = el.getAttribute('data-name'),
            func = el.getAttribute('data-class');

        rivets.components[name] = {
            template: function() { return el.innerHTML },
            initialize: function(el, data) {
                return new Components[func](data)
            }
        };
    })
}

function run(): void {
    loadComponents();
    app = window["app"] = new App();
    app.run();
}

window.onerror = function(e) {
    window.close();
    bg.console.trace(e);
    bg._ga('browser_exception', e);
};

window.onload = run;
