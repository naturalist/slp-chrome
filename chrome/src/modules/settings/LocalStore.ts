/// <reference path="../../../typings/chrome/chrome.d.ts" />
/// <reference path="../settings.ts" />
/// <reference path="../interfaces.ts" />
/// <reference path="../keys.ts" />

module Settings {

    export interface SettingsConfig {
        privateKey: string;
        store: chrome.storage.StorageArea;
    }

    export class LocalStore implements Settings.Interface {
        private config: SettingsConfig;

        constructor(config: any) {
            this.config = config.settings.localStore;
        }

        private checkRuntimeError(): void {
            if ( typeof chrome.runtime != "undefined" && chrome.runtime.lastError ) {
                throw chrome.runtime.lastError;
            }
        }

        storePrivateKey(key: Keys.PrivateKey, callback: Interfaces.Callback): void {
            var setter: Interfaces.Dictionary = {};
            setter[this.config.privateKey] = key.armored();
            this.config.store.set(setter, () => {
                this.checkRuntimeError();
                callback();
            });
        }

        loadPrivateKey(callback: PrivateKeyCallback): void {
            this.config.store.get(this.config.privateKey, (result) => {
                callback(result[this.config.privateKey]);
            });
        }

        removePrivateKey(callback: Interfaces.Callback): void {
            this.config.store.remove(this.config.privateKey, () => {
                callback();
            });
        }
    }
}