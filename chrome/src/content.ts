/// <reference path="../typings/chrome/chrome.d.ts" />
/// <reference path="modules.d.ts" />

// These get initialized by the background page
var init: Interfaces.InitVars;

// Observer for newly created elements
var observer: MutationObserver;


// The class name to use to mark nodes as decrypted
var pgpClassName = '__pgp';

function decodeText(codedText: string, callback: { (decodedText): void }): void {
    var re = new RegExp(init.linkRe),
        match = re.exec(codedText),
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
            codedText = codedText.replace(url, "<span class='" + pgpClassName + "' rel=" + messageId + ">" + result.value + "</span>");
        } else {
            codedText = codedText.replace(url, "[PGP MESSAGE:" + messageId + "]"); // TODO: add link
        }
        decodeText(codedText, callback);
    });
};

function decodeNode(node: Node): void {
    decodeText( node.nodeValue, (newValue) => {
        if ( newValue != node.nodeValue ) {

            // Remove links (some sites hotlink URLs)
            if ( node.parentElement.tagName == "A" ) {
                var el = document.createElement('span');
                el.innerHTML = newValue;
                node.parentElement.parentElement.appendChild(el);
                node.parentElement.remove();
            } else {
                node.parentElement.innerHTML = newValue;
            }
        }
    });
}

function traverseNodes(root: HTMLElement): void {
    var walk: TreeWalker,
        node: Node,
        re: RegExp;

    re = new RegExp(init.linkRe);

    // Create a walker from the root element, searching only for text nodes
    walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

    while (node = walk.nextNode()) {
        if (node.nodeValue.match(re)) {
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

function getInitVars(callback: Interfaces.Callback): void {
    chrome.runtime.sendMessage({command: 'init'}, (result) => {
        init = result.value;
        callback()
    });
}

// Listen for messages from the extension
function listenToMessages() {

    // The name of the flag that we will use in the text area element to
    // signal that it has been encrypted.
    var _crypted = '_pgp_crypt';


    // The handler function to be added oninput to each encrypted element.
    // It listens for changes in value and marks the element as non-encrypted.
    var inputListener = function(e: Event) {
        e.target[_crypted] = false;
    };


    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        var el: HTMLTextAreaElement;

        // Get the active element. It should be analyzed by the caller.
        // ------------------------------------------------------------
        if ( msg.getElement ) {
            el = <HTMLTextAreaElement>document.activeElement;
            sendResponse({
                tagName: el.tagName,
                value: el.value,
                crypted: el[_crypted]
            });
        }

        // Set the active element and mark it as encrypted
        // ------------------------------------------------------------
        else if ( msg.setElement ) {
            el = <HTMLTextAreaElement>document.activeElement;

            if ( el.tagName == 'TEXTAREA' ) {
                el.value = msg.setElement;
                el.dispatchEvent(new Event('input'));
                el.focus();

                // Mark the element as encrypted, so it can not be double-encrypted
                el[_crypted] = true;

                // If the element value ever changes, then clear the encrypted flag.
                // You can not double-bind the same function, so there is no need to
                // wrap this in a condition.
                el.addEventListener('input', inputListener);
            }
        }

        // Decrypt all nodes
        // ------------------------------------------------------------
        else if ( msg.traverse ) {
            getInitVars(() => { traverseNodes(document.body) });
        }

        // Return all nodes to their cryptic urls
        // ------------------------------------------------------------
        else if ( msg.lock ) {
            var els = document.getElementsByClassName(pgpClassName);
            var i: number;
            for (i = 0; i < els.length; i++) {
                var e = <HTMLElement>els[i];
                var id = e.getAttribute('rel');
                e.innerHTML = "http://localhost:8080/x/" + id;
            }
        }
    });
}

// Get variables and bootstrap
getInitVars(() => {
    traverseNodes(document.body);
    eventObserver();
    listenToMessages();
})
