/// <reference path="../typings/chrome/chrome.d.ts" />
/// <reference path="modules.d.ts" />

// These get initialized by the background page
var init: Interfaces.InitVars;

// Observer for newly created elements
var observer: MutationObserver;

// Regular expression for the url
var urlRe: RegExp;

// Connection port for messages to background
var port: chrome.runtime.Port;

// Generator of element IDs
function idGenerator (prefix: string) {
    if (typeof prefix == "undefined") prefix = "id";
    return Math.random().toString(36).substr(2, 16);
};

interface BgPageArgs {
    frameId?: string;
    elementId?: string;
    messageId?: string;
    properties?: any;
    text?: string;
    lastKeysUsed?: Array<Interfaces.Fingerprint>;
    url?: string;
}

function messageBgPage(command: string, args: BgPageArgs, callback?: Interfaces.ResultCallback): void {
    var message = args ? args : {};
    message["command"] = command;
    chrome.runtime.sendMessage(message, callback);
}

interface ContentMessage {
    getElementText?: boolean;
    setElementText?: string;
    traverse?: boolean;
    lock?: boolean;
    restoreElementText?: boolean;
    encryptLast: boolean;

    elementLocator?: Interfaces.ElementLocator;
    lastKeysUsed?: Array<string>;
}

// Installs listeners for 'input' and 'click' to all editable and textareas
class Editable {
    element: HTMLElement = null;
    frameId: string;
    savedValue: string;
    lastKeysUsed: Array<string>;

    constructor(el: HTMLElement) {
        // If the element was already initialized, then bail
        if ( $data(el, init.config.pgpElAttr) ) return;

        // If the element has no id, then assign one to it
        if ( el.id == "" ) {
            el.id = idGenerator('editable');
        }

        this.element = el;
        this.frameId = window.frameElement ? window.frameElement.id : null;
        this.bindEvents();

        // Save the new instance in an attribute on the element
        $data(this.element, init.config.pgpElAttr, this);
    }

    private bindEvents(): void {
        var eventHandler = function() {
            messageBgPage('setActiveElement', {
                frameId: this.frameId,
                elementId: this.element.id
            });

            messageBgPage('updateContextMenu', { 
                properties: { enabled: this.okToUseLast() } 
            });
        }.bind(this);

        // Change listeners
        this.element.addEventListener('focus', eventHandler);
        this.element.addEventListener('click', eventHandler);
        this.element.addEventListener('input', eventHandler);

        // Quick encrypt shortcut
        this.element.addEventListener('keydown', (e: KeyboardEvent) => {
            var trigger: boolean;
            trigger = e.keyCode == 76 && e.metaKey == true && e.altKey == true;
            if (trigger == true) this.encryptLast();
        })
    }

    private okToUseLast(): boolean {
        return this.getText()
            && !urlRe.exec(this.getText())
            && this.lastKeysUsed 
            && this.lastKeysUsed.length > 0 
                ? true 
                : false
    }

    // Encrypt the editable with the last keys used
    encryptLast(callback?: Interfaces.ResultCallback): void {
        if ( this.okToUseLast() == false ) return;

        var args = {
            text: this.getText(), 
            lastKeysUsed: this.lastKeysUsed 
        };

        messageBgPage('encryptLastKeysUsed', args, (result) => {
            if ( result.success ) {
                this.setText(result.value);
                if ( callback ) callback(result.value);
            }
        });
    }

    // Get the text value of the editable
    getText(): string {
        if ( !this.element ) return;
        return this.element.tagName == "TEXTAREA"
            ? (<HTMLTextAreaElement>this.element).value
            : this.element.textContent;
    }

    // Set a new text value in the editable element while saving the original
    // value of the element so it can be restored
    setText(text: string, noSave?: boolean): void {
        if ( !this.element ) return;

        // Save original value
        if (!noSave) {
            this.savedValue = this.getText();
        }

        // Set new value
        if ( this.element.contentEditable == "true" ) {
            this.element.textContent = text;
        } else if ( this.element.tagName == "TEXTAREA" ) {
            (<HTMLTextAreaElement>this.element).value = text;
        }

        // Dispatch events and focus
        this.element.dispatchEvent(new Event('input'));
        this.element.focus();
    }


    // Restore the saved value of the element
    restoreText(): boolean {
        if ( !this.element ) return;
        if ( typeof this.savedValue != "undefined" && this.savedValue != null ) {
            this.setText(this.savedValue, true);
            this.savedValue = null;
            return true;
        }

        return false;
    }
}

// Takes a parent element, searches for elements with a spcific class name
// and attaches onClick bindings so they can be imported into the user's address
// book
var hotlinkPublicKeys = (function() {

    function _bindOnClick(el: HTMLElement) {
        return function(e: MouseEvent): void {
            e.preventDefault();
            e.stopPropagation();
            messageBgPage('addPublicKey', { messageId: el.getAttribute('rel') }, (result) => {
                if ( result.success ) {
                    el.classList.add(init.config.pgpPKAdded);
                    el.removeEventListener('click', _bindOnClick(el));
                }
            })
        }
    }

    function hotlinkPublicKeys(parentEl: HTMLElement): void {
        var list = parentEl.getElementsByClassName(init.config.pgpPK),
            i: number;

        for (i = 0; i < list.length; i++) {
            var el = list[i];
            if (el.classList.contains(init.config.pgpPKAdded)) continue;
            el.addEventListener('click', _bindOnClick(<HTMLElement>el));
        }
    }

    return hotlinkPublicKeys;
})();

var traverseNodes = (function(){

    function decodeURL(url: string, callback: { (decodedText): void }): void {
        messageBgPage( 'decryptLink', { url: url }, (result) => {
            callback( result.success ? result.value : "Error decrypting" );
            if ( !result.success )
                console.log(result.error);
        });
    }

    function decodeNode(node: Node, url: string): void {

        // If the private key has not been unlocked, then add a notification
        if ( !init.isDecrypted ) {
            messageBgPage('needPassword', {});
            return;
        }

        decodeURL(url, (newValue) => {
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
        });
    }

    // Tells if the A element is a match for decryption. Most A elements will
    // have the URL in the href attribute, but Twitter (and possibly others)
    // will have it in the 'data-expanded-url'. This function tries all of them
    // to determine match.  Returns the match result or null.
    function isLinkMatch(el: HTMLElement): Array<string> {
        var match: Array<string>,
            attrs = ['href', 'data-expanded-url'],
            i: number;

        for(i = 0; i < attrs.length; i++) {
            if (match = urlRe.exec(el.getAttribute(attrs[i])))
                return match;
        }
    }

    // Tells if the element is inside an editable. It will check up to 'steps'
    // levels up to find the editable element.  Twitter (and possibly others)
    // will create a link inside the editable. We don't want to decrypt it!
    function isInsideEditable(el: HTMLElement): boolean {
        var steps: number = 3;

        while (el.parentElement && !el.parentElement.isContentEditable && steps > 0){
            el = el.parentElement;
            steps--;
        }

        return el.parentElement && el.parentElement.isContentEditable;
    }

    function traverseNodes(root: HTMLElement): void {
        var walk: TreeWalker,
            node: Node,
            match;

        // Create a walker from the root element, searching only for text nodes
        walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);

        while (node = walk.nextNode()) {
            if ( node.nodeType == Node.TEXT_NODE ) {
                if ( match = urlRe.exec(node.nodeValue) ) {
                    decodeNode(node, match[0]);
                }
            } else if ( node.nodeType == Node.ELEMENT_NODE ) {
                var el = <HTMLElement>node;

                // Is it editable? Then make it work.
                if ( el.contentEditable  == "true" || el.tagName == "TEXTAREA" ) {
                    new Editable(el);

                // Is it a link? Then get the url from it, place it in the textContent of the link,
                // then traverse this node only to decode
                } else if ( el.tagName == "A" && (match = isLinkMatch(el)) ) {
                    if (!isInsideEditable(el)) decodeNode(node, match[0]);
                    walk.nextNode();    // Skip next node (it's the text inside the A)
                }
            }
        }
    }

    return traverseNodes;
})();

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
    messageBgPage('initVars', {}, (result) => {
        init = result.value;
        urlRe = new RegExp(init.linkRe);
        callback()
    });
}

function $data(el: HTMLElement, name: string, value?: any): any {
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

    var editable: Editable;

    // Get the active element and its value
    // ------------------------------------------------------------
    var getElementText = function(msg: ContentMessage, sendResponse) {
        if (!editable) return;
        sendResponse({ 
            value: editable.getText(), 
            lastKeysUsed: editable.lastKeysUsed 
        });
    }

    // Set the active element and mark it as encrypted
    // ------------------------------------------------------------
    var setElementText = function(msg: ContentMessage, sendResponse) {
        if (!editable) return;
        editable.setText(msg.setElementText);
        editable.lastKeysUsed = msg.lastKeysUsed;
    }

    // Restore the original text of the textarea
    // ------------------------------------------------------------
    var restoreElementText = function(msg: ContentMessage, sendResponse) {
        if (!editable) return;
        var result = editable.restoreText();
        sendResponse({ success: result });
    }


    var encryptLast = function(msg: ContentMessage, sendResponse) {
        if (!editable) return;
        editable.encryptLast();
    }

    // Return all decrypted nodes to their original values
    // ------------------------------------------------------------
    var lock = function(msg: ContentMessage, sendResponse) {
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
    var traverse = function(msg: ContentMessage, sendResponse) {
        getInitVars(() => { traverseNodes(document.body) });
    }

    // Message listener
    // ============================================================
    chrome.runtime.onMessage.addListener((msg: ContentMessage, sender, sendResponse) => {
        var eloc: Interfaces.ElementLocator,
            element: HTMLElement;

        // If element locator element is provided in the message, then we're
        // dealing with an editable and we need to first locate it.
        if ( eloc = msg.elementLocator ) {

            // If we're in a frame and the id of the frame does not match the
            // one provided in the locator, then no.
            if ( window.frameElement && window.frameElement.id != eloc.frameId )
                return;

            // If we're in the top window and the id of the frame in the
            // locator is not null, then no.
            if ( !window.frameElement && eloc.frameId != null )
                return;

            // At this point, we have determined that the element and frame ID
            // provided in the locator match the document we're running in.
            if (element = document.getElementById(eloc.elementId)) {
                editable = $data(element, init.config.pgpElAttr);
            }
        } else {
            editable = null;
        }

        if ( msg.getElementText )
            getElementText(msg, sendResponse)
        else if ( msg.setElementText)
            setElementText(msg, sendResponse)
        else if ( msg.traverse )
            traverse(msg, sendResponse)
        else if ( msg.lock )
            lock(msg, sendResponse)
        else if ( msg.restoreElementText )
            restoreElementText(msg, sendResponse)
        else if ( msg.encryptLast )
            encryptLast(msg, sendResponse)
    });
}

// Bootstrap
getInitVars(() => {

    // If we are in a frame and the frame has no id attribute,
    // then assign one to it
    if ( window.frameElement && !window.frameElement.id ) {
        window.frameElement.id = idGenerator('frame');
    }

    if ( init.hasPrivateKey ) {
        traverseNodes(document.body);
        eventObserver();
        listenToMessages();
    }
})
