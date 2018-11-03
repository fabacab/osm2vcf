/**
 * This is a Greasemonkey script.
 */
// ==UserScript==
// @name        OSM2VCF
// @author      maymay <bitetheappleback@gmail.com>
// @description Download OSM node/way data as a vCard.
// @include https://www.openstreetmap.org/node/*
// @version     1
// @grant    GM.xmlHttpRequest
// ==/UserScript==

// Initialize.
CONFIG = {};
CONFIG.api_anchor = document.querySelector('[href^="/api"]');
CONFIG.api_url = CONFIG.api_anchor.getAttribute('href');

CONFIG.vCard = {};
CONFIG.vCard.version = '3.0';

/**
 * Makes the "Download VCF" link in the OSM Web interface.
 *
 * @return HTMLElement
 */
function createDownloadLink () {
    var dl_btn = document.createElement('a');
    dl_btn.addEventListener('click', main);
    dl_btn.innerText = 'Download VCF';
    dl_btn.setAttribute('href', '#')
    return dl_btn;
}

/**
 * Initialize the UI by creating a download link.
 */
function init () {
    CONFIG.api_anchor.insertAdjacentElement('afterend', createDownloadLink());
    CONFIG.api_anchor.insertAdjacentHTML('afterend', ' · ');
}

/**
 * Receives the XMLHttpRequest response from the OSM API server.
 *
 * The body of this response should be an XML document in OSM style.
 *
 * @param {object} response
 * @return {object}
 */
function parseApiResponse (response) {
    var el = response.responseXML.documentElement;

    var name_node = el.querySelector('tag[k="name"]');
    var name = name_node.getAttribute('v');

    var street_node = el.querySelector('tag[k="addr:street"]');

    return {
        'FN': name,
        'N': [
            'FIXME',
            'FIXME2',
            'FIXME3',
            'FIXME4'
        ],
        'ORG': 'FIXME',
        'REV': new Date().toISOString(),
        'ADR': {
            // TODO: Finish ADR parsing.
        }
    }
}

/**
 * Write parsed data in VCF format.
 * 
 * @param {object} data
 * @return {string}
 */
function vCardWriter (data) {
    vcf_string = "BEGIN:VCARD";
    vcf_string += "\nVERSION:" + CONFIG.vCard.version;
    vcf_string += "\nPRODID:OSM2VCF Userscript";

    // TODO: write the vcard.
    vcf_string += "\nFN:" + data.FN;

    vcf_string += "\nEND:VCARD";
    return vcf_string;
}

/**
 * Main entry point for the script.
 *
 * @param {MouseEvent} e
 */
function main (e) {
    e.preventDefault();
    e.stopImmediatePropagation();

    // Get the node's XML data.
    GM.xmlHttpRequest({
        'method': 'GET',
        'synchronous': true,
        'url': window.location.protocol + '//' + window.location.host + CONFIG.api_url,
        'onload': function (response) {
            var vcf = vCardWriter(parseApiResponse(response));
            window.location = 'data:text/vcard,' + vcf;
        }
    });

    // 2. Grabbing the body of the response.
    // Parse the XML data looking for address, etc.
    // Construct a VCF from this data.
    // Offer a download dialogue to the user.
}

init();
