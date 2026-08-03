// Small DOM helpers shared by every admin page.

export function $(id) { return document.getElementById(id); }

export function setVal(id, v) { $(id).value = v === undefined || v === null ? '' : String(v); }
