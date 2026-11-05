import { test } from "node:test";
import assert from "node:assert/strict";
import { API_BASE_URL } from "../src/js/api.js";
import {
  EXPORT_MESSAGES,
  defaultExportFilename,
  exportErrorMessage,
  fetchUsageExport,
  filenameFromDisposition,
} from "../src/js/dashboard-export.js";

const CSV = "﻿Monat;Kennzahl;Wert\r\n2026-11;Durchgeführte Simulationen;41\r\n";

function csvResponse(disposition = 'attachment; filename="lookupstock-nutzung-2026-11.csv"') {
  return new Response(CSV, {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=UTF-8", "Content-Disposition": disposition },
  });
}

function errorResponse(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("the export calls the export endpoint with month and Bearer token (US-12, ADR-06)", async () => {
  const calls = [];
  await fetchUsageExport("abc", "2026-11", async (url, options) => {
    calls.push({ url, options });
    return csvResponse();
  });

  assert.equal(calls[0].url, `${API_BASE_URL}/api/v1/reports/usage/export?month=2026-11`);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.headers.Authorization, "Bearer abc");
});

test("the export returns the file and the file name from Content-Disposition (E41)", async () => {
  const { blob, filename } = await fetchUsageExport("abc", "2026-11", async () => csvResponse());

  assert.equal(filename, "lookupstock-nutzung-2026-11.csv");
  assert.equal(await blob.text(), CSV.slice(1)); // Blob.text() strips the BOM when decoding.
  assert.equal(blob.size, new TextEncoder().encode(CSV).length);
});

test("without a readable Content-Disposition the file name follows E41", () => {
  assert.equal(filenameFromDisposition(null, "2026-10"), "lookupstock-nutzung-2026-10.csv");
  assert.equal(filenameFromDisposition("attachment", "2026-10"), defaultExportFilename("2026-10"));
  assert.equal(filenameFromDisposition("attachment; filename=lookupstock-nutzung-2026-09.csv", "x"), "lookupstock-nutzung-2026-09.csv");
});

test("403 from the backend becomes the backend message (E40)", async () => {
  const failing = async () => errorResponse(403, "FORBIDDEN", "Dafür fehlt die Berechtigung.");

  await assert.rejects(fetchUsageExport("abc", "2026-11", failing), (error) => {
    assert.equal(error.status, 403);
    assert.equal(exportErrorMessage(error), "Dafür fehlt die Berechtigung.");
    return true;
  });
});

test("400 for a month without data shows the backend message (E38)", async () => {
  const failing = async () => errorResponse(400, "VALIDATION_ERROR", "Für diesen Monat liegen keine Auswertungen vor.");

  await assert.rejects(fetchUsageExport("abc", "2026-09", failing), (error) => {
    assert.equal(exportErrorMessage(error), "Für diesen Monat liegen keine Auswertungen vor.");
    return true;
  });
});

test("401 asks to log in again like the dashboard, a network error has its own message", async () => {
  await assert.rejects(fetchUsageExport("abc", "2026-11", async () => errorResponse(401, "UNAUTHORIZED", "Bitte melde dich an.")), (error) => {
    assert.equal(exportErrorMessage(error), EXPORT_MESSAGES.unauthorized);
    return true;
  });
  await assert.rejects(fetchUsageExport("abc", "2026-11", async () => { throw new TypeError("offline"); }), (error) => {
    assert.equal(exportErrorMessage(error), "Der Server ist gerade nicht erreichbar.");
    return true;
  });
});
