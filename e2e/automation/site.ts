import http from "node:http";
import type { AddressInfo } from "node:net";

/** A small, valid PDF generated without an external service or binary tooling. */
export function samplePdf(): Buffer {
  const content = "BT /F1 24 Tf 40 740 Td (Chiaroscuro verification PDF) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /Outlines 6 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Outlines /First 7 0 R /Last 7 0 R /Count 1 >>",
    "<< /Title (Fixture outline) /Parent 6 0 R /Dest [3 0 R /Fit] >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export async function startSite(onRequest?: (request: http.IncomingMessage) => void) {
  const server = http.createServer((request, response) => {
    onRequest?.(request);
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/sample.pdf") {
      response.writeHead(200, { "Content-Type": "application/pdf" });
      response.end(samplePdf());
      return;
    }
    if (url.pathname === "/download") {
      response.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="verification.txt"',
      });
      response.end("deterministic download\n");
      return;
    }
    if (url.pathname === "/failure") {
      response.writeHead(503);
      response.end("Intentional fixture failure");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Verification ${url.pathname.replace(/[^a-z/-]/gi, "")}</title>
      <style>body{font:20px system-ui;background:#e7edf5;color:#172a42;padding:32px}button,input,a{font:inherit;margin:12px;padding:8px}#scroll{height:180px;overflow:auto;border:2px solid}#spacer{height:600px}</style>
      <h1>Local verification page</h1><label>Message <input aria-label="Message"></label><button id="apply">Apply</button><output id="result"></output>
      <p><a href="/child" target="_blank">Open sub-tab</a><button id="popup">Open popup</button><a href="/sample.pdf">Read PDF</a><a href="/download">Download fixture</a></p>
      <label>Upload fixture <input type="file" aria-label="Upload fixture"></label><output id="file"></output>
      <button id="permission">Request notification permission</button><output id="permission-result"></output>
      <div id="scroll" aria-label="Scrollable fixture"><div id="spacer">Scroll down</div><button>Bottom button</button></div>
      <script>
      document.querySelector('#apply').onclick=()=>document.querySelector('#result').textContent=document.querySelector('input').value;
      document.querySelector('#popup').onclick=()=>window.open('/popup','verification-popup','width=500,height=400');
      document.querySelector('[type=file]').onchange=e=>document.querySelector('#file').textContent=e.target.files[0]?.name;
      document.querySelector('#permission').onclick=async()=>document.querySelector('#permission-result').textContent=await Notification.requestPermission();
      </script></html>`);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
