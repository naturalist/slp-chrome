module Interfaces {

    export interface Dictionary extends Object {
        [index: string]: any;
    }

    export interface Callback {
        (): void;
    }

    export interface ResultCallback {
        (result: any): void;
    }

    export interface Success {
        success: boolean;
        error?: string;
    }

    export interface SuccessCallback {
        (result: Success & { value?: any }): void;
    }

    export interface InitVars {
        linkRe?: string;
        isDecrypted?: boolean;
        hasPrivateKey?: boolean;
        config?: Config;
    }

    export interface ElementLocator {
        command?: string;
        frameId: string;
        elementId: string;
    }

    export interface ElementLocatorDict {
        [tabId: number]: ElementLocator;
    }

    export interface StoreCollection {
        privateKey: PrivateKeyStore.Interface;
        message: MessageStore.Interface;
        addressBook: AddressBookStore.Interface;
        preferences: PrefsStore;
    }

    export interface Preferences {
        publicKeyUrl: string;
        publicKeySaveTime: Date;
    }

    export interface BackgroundPage extends Window {
        config: Config;
        store: StoreCollection;
        privateKey: Keys.PrivateKey;
        elementLocatorDict: ElementLocatorDict;
        preferences: Preferences;

        initialize(): InitVars;
        encryptMessage(text: string, keyList: Array<openpgp.key.Key>, callback: Interfaces.SuccessCallback): void;
        lockDown(callback?: Callback): void;
    }
}
