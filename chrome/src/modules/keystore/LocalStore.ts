/// <reference path="../../../typings/chrome/chrome.d.ts" />
/// <reference path="../interfaces.ts" />
/// <reference path="../keys.ts" />
/// <reference path="../keystore.ts" />

module KeyStore {

    interface LocalStoreConfig {
        // chrome storage (local or sync)
        store: chrome.storage.StorageArea;

        // public keys
        directory: string;

        // messages
        messages: string;
    }

    interface KeyDirectory {
        [fingerprint: string]: Array<string>;
    }

    export class LocalStore implements KeyStore.Interface {
        private directory: KeyDirectory = {};
        private messages: Interfaces.Dictionary = {};
        private config: LocalStoreConfig;

        constructor(config: any) {
            this.config = config.keyStore.localStore;
        }

        private checkRuntimeError(): void {
            if ( typeof chrome.runtime != "undefined" && chrome.runtime.lastError ) {
                throw chrome.runtime.lastError;
            }
        }

        initialize(callback: Interfaces.Callback): void {
            var mk = this.config.messages;
            var dk = this.config.directory;

            // Load the directory with public keys and messages
            this.config.store.get([mk, dk], (result) => {
                this.directory = result[dk] || {};
                this.messages = result[mk] || {}
                callback();
            });
        }

        storePublicKey(key: Keys.PublicKey, callback: Interfaces.Callback): void {
            var p = key.fingerprint(),
                k = this.config.directory,
                setter = {};

            if ( this.directory[p] ) return;
            this.directory[p] = key.userIds();

            setter[p] = key.armored();
            setter[k] = this.directory;

            this.config.store.set( setter, () => {
                this.checkRuntimeError();
                callback();
            });
        }

        loadPublicKey(fingerprint: string, callback: PublicKeyCallback): void {
            this.config.store.get( fingerprint, (items) => {
                this.checkRuntimeError();
                callback(items[fingerprint]);
            });
        }

        searchPublicKey(userId: string, callback: PublicKeySearchCallback): void {
            var result: PublicKeyArray = [],
                re = new RegExp(userId),
                getter: Array<string> = [];

            Object.keys(this.directory).forEach((p) => {
                var userIds = this.directory[p];
                userIds.forEach(id => {
                    if (id.match(re)) getter.push(p);
                });
            })

            this.config.store.get( getter, (item) => {
                var key: Keys.PublicKey;

                this.checkRuntimeError();

                Object.keys(item).forEach((p) => {
                    key = new Keys.PublicKey( item[p] );
                    result.push( key );
                });

                callback(result);
            });
        }

        deleteAllPublicKeys(callback: Interfaces.Callback): void {
            var deleter: Array<string> = Object.keys(this.directory);

            this.config.store.remove( deleter, () => {
                this.checkRuntimeError();
                this.directory = {};
                callback();
            });
        }

    }

}
