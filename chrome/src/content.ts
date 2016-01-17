/// <reference path="../typings/chrome/chrome.d.ts" />
/// <reference path="modules.d.ts" />

// These get initialized by the background page
var init: Interfaces.InitVars;

// Observer for newly created elements
var observer: MutationObserver;

// Regular expression for the url
var urlRe: RegExp;

function decodeText(codedText: string, callback: { (decodedText): void }): void {
     var   match = urlRe.exec(codedText),
        messageId: string,
        url: string;

    if (!match) {
        callback(codedText);
        return;
    }

    url = match[0];
    messageId = match[1];

    chrome.runtime.sendMessage({ command: "decryptLink", url: url }, (result) => {
        if ( result.success ) {
            codedText = codedText.replace(url, result.value);
        } else {
            codedText = "Error decrypting"
        }
        decodeText(codedText, callback);
    });
};

// This closure is used by 'hotlinkPublicKeys'. It returns a 'click' binder
// which is attached to public key buttons.
function _bindOnClick(el: HTMLElement) {
    return function(e: MouseEvent): void {
        e.preventDefault();
        e.stopPropagation();
        chrome.runtime.sendMessage({ command: 'addPublicKey', messageId: el.getAttribute('rel') }, (result) => {
            if ( result.success ) {
                el.classList.add(init.config.pgpPKAdded);
                el.removeEventListener('click', _bindOnClick(el));
            }
        })
    }
}

// Takes a parent element, searches for elements with a spcific class name
// and attaches onClick bindings so they can be imported into the user's address
// book
function hotlinkPublicKeys(parentEl: HTMLElement): void {
    var list = parentEl.getElementsByClassName(init.config.pgpPK),
        i: number;

    for (i = 0; i < list.length; i++) {
        var el = list[i];
        if (el.classList.contains(init.config.pgpPKAdded)) continue;
        el.addEventListener('click', _bindOnClick(<HTMLElement>el));
    }
}

function decodeNode(node: Node): void {
    decodeText( node.nodeValue, (newValue) => {
        if ( newValue != node.nodeValue ) {
            var parentEl = node.parentElement;

            // Remove links (some sites hotlink URLs)
            if ( parentEl.tagName == 'A' ) {
                parentEl = parentEl.parentElement;
            }

            // Save the current value of the element and give it a new class
            $data(parentEl, init.config.pgpData, parentEl.innerHTML)
            parentEl.classList.add(init.config.pgpClassName);

            // Set the new value
            parentEl.innerHTML = newValue;

            // Create public key hotlinks
            hotlinkPublicKeys(parentEl);
        }
    });
}

function traverseNodes(root: HTMLElement): void {
    var walk: TreeWalker,
        node: Node;

    // Create a walker from the root element, searching only for text nodes
    walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    while (node = walk.nextNode()) {
        if (node.nodeValue.match(urlRe)) {
            if ( init.isDecrypted ) {
                decodeNode(node);
            } else {
                chrome.runtime.sendMessage({ command: 'needPassword' });
            }
        }
    }
}

// Observe for new nodes
function eventObserver(): void {
    observer = new MutationObserver((mutationArray) => {
        mutationArray.forEach((mutation) => {
            for (var i = 0; i < mutation.addedNodes.length; i++) {
                var node = mutation.addedNodes[i];
                traverseNodes(<HTMLElement>node);
            }
        });
    });
    observer.observe(document, { childList: true, subtree: true });
}

// Retrieves variables indicating the status of the background page, such as
// 'isDecrypted' (the private key) and others.
function getInitVars(callback: Interfaces.Callback): void {
    chrome.runtime.sendMessage({command: 'init'}, (result) => {
        init = result.value;
        urlRe = new RegExp(init.linkRe);
        callback()
    });
}

function $data(el: HTMLElement, name: string, value?: any): string {
    if ( typeof value != "undefined" ) {
        if ( value == null )
            delete el.attributes[name]
        else
            el.attributes[name] = value;
    }

    return el.attributes[name];
}

// Listen for messages from the extension
function listenToMessages() {

    // The name of the flag that we will use in the text area element to
    // signal that it has been encrypted.
    var _crypted = '__pgp_crypted';

    // Set the textarea value and fire the change events
    var setElementValue = function(el: HTMLTextAreaElement, value: string): void {
        el.value = value;
        el.dispatchEvent(new Event('input'));
        el.focus();
    }

    // Get the active element and its value
    // ------------------------------------------------------------
    var getElement = function(msg, sendResponse) {
        var el = <HTMLTextAreaElement>document.activeElement;
        sendResponse({ tagName: el.tagName, value: el.value });
    }

    // Set the active element and mark it as encrypted
    // ------------------------------------------------------------
    var setElement = function(msg, sendResponse) {
        var el = <HTMLTextAreaElement>document.activeElement;

        // If the active element is not a textarea, then find one
        if ( el.tagName !== 'TEXTAREA' ) {
            var els = document.getElementsByTagName('textarea');
            if ( els.length > 0 ) {
                // Get the last textarea found
                el = <HTMLTextAreaElement>els[els.length - 1];
            }
        }

        if ( el.tagName == 'TEXTAREA' ) {
            // Save the original value of the element so it can be restored
            $data(el, _crypted, el.value);

            // Set new value (encrypted url)
            setElementValue(el, msg.setElement);
        }
    }

    // Restore the original text of the textarea
    // ------------------------------------------------------------
    var restoreElement = function(msg, sendResponse) {
        var el = <HTMLTextAreaElement>document.activeElement,
            orgValue: string;

        orgValue = $data(el, _crypted);
        if ( typeof orgValue != "undefined" && orgValue != null ) {
            $data(el, _crypted, null);
            setElementValue(el, orgValue);
            sendResponse({ success: true })
        } else {
            sendResponse({ success: false });
        }
    }

    // Return all decrypted nodes to their original values
    // ------------------------------------------------------------
    var lock = function(msg, sendResponse) {
        var els = document.getElementsByClassName(init.config.pgpClassName),
            i: number,
            parentEl: HTMLElement,
            orgValue: string;

        observer.disconnect()
        getInitVars(() => {
            // getElementsByClassName returns a live collection, which will
            // change as the collection criteria changes. This is why we
            // remove the class names in reverse
            for (i = els.length - 1; i >= 0; i--) {
                parentEl = <HTMLElement>els[i];
                parentEl.classList.remove(init.config.pgpClassName);
                if ( orgValue = $data(parentEl, init.config.pgpData) ) {
                    parentEl.innerHTML = orgValue;
                    $data(parentEl, init.config.pgpData, null);
                }
            }
            observer.observe(document, { childList: true, subtree: true });
        });
    }

    // Decrypt all nodes
    // ------------------------------------------------------------
    var traverse = function(msg, sendResponse) {
        getInitVars(() => { traverseNodes(document.body) });
    }

    // Message listener
    // ============================================================
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if ( msg.getElement )
            getElement(msg, sendResponse)
        else if ( msg.setElement )
            setElement(msg, sendResponse)
        else if ( msg.traverse )
            traverse(msg, sendResponse)
        else if ( msg.lock )
            lock(msg, sendResponse)
        else if ( msg.restore )
            restoreElement(msg, sendResponse)
    });
}

// Get variables and bootstrap
getInitVars(() => {
    if ( init.hasPrivateKey ) {
        traverseNodes(document.body);
        eventObserver();
        listenToMessages();
    }
})
