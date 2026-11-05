import { test } from "node:test";
import assert from "node:assert/strict";
import { showStatus } from "../src/js/simulation.js";

function fakeElement() {
  const classes = new Set(["summary-status"]);
  return {
    textContent: "",
    classList: {
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
      contains: (name) => classes.has(name),
    },
  };
}

test("an error message is shown in red (H3)", () => {
  const element = fakeElement();
  showStatus(element, "Kursdaten sind gerade nicht verfügbar.", true);

  assert.equal(element.textContent, "Kursdaten sind gerade nicht verfügbar.");
  assert.equal(element.classList.contains("summary-status-invalid"), true);
});

test("a progress hint is not shown in red (H3)", () => {
  const element = fakeElement();
  showStatus(element, "Vergleich wird berechnet …");

  assert.equal(element.classList.contains("summary-status-invalid"), false);
});

test("after an error the red highlight is removed with the next hint (H3)", () => {
  const element = fakeElement();
  showStatus(element, "Bitte die markierten Eingaben prüfen.", true);
  showStatus(element, "");

  assert.equal(element.textContent, "");
  assert.equal(element.classList.contains("summary-status-invalid"), false);
  assert.equal(element.classList.contains("summary-status"), true);
});
