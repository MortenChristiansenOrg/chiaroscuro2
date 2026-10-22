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
    if (url.pathname === "/pdf-redirect") {
      response.writeHead(302, { Location: "/pdf-document?redirected=1" });
      response.end();
      return;
    }
    if (url.pathname === "/private-document") {
      if (!request.headers.cookie?.split("; ").includes("pdf-session=verified")) {
        response.writeHead(401);
        response.end("Sign in to read this PDF");
        return;
      }
      response.writeHead(200, { "Content-Type": "application/pdf", "Cache-Control": "no-store" });
      response.end(samplePdf());
      return;
    }
    if (url.pathname === "/pdf-login") {
      response.setHeader(
        "Set-Cookie",
        "pdf-session=verified; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600",
      );
    }
    if (url.pathname === "/sample.pdf" || url.pathname === "/pdf-document") {
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
    if (url.pathname === "/app-region") {
      // Sites built for desktop app shells (e.g. chatgpt.com) declare window drag regions (#51).
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Verification app-region</title>
        <style>body{margin:0;font:20px system-ui}header{position:fixed;inset:0 0 auto 0;height:160px;background:#cfd8e3;-webkit-app-region:drag !important}button{-webkit-app-region:no-drag;margin:24px}dialog::backdrop{app-region:drag !important}</style>
        <header style="app-region: drag !important"><button id="header-button">Header button</button></header>
        <main style="padding-top:180px">Page with a drag region</main><div id="shadow-host"></div><dialog>Modal dialog</dialog>
        <script>document.querySelector('#shadow-host').attachShadow({mode:'open'}).innerHTML='<div style="position:fixed;inset:160px 0 auto 0;height:40px;app-region:drag"></div>'</script></html>`);
      return;
    }
    if (url.pathname === "/window-open-panel") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      const panelOrigin = `http://localhost:${server.address() && (server.address() as AddressInfo).port}`;
      response.end(
        `<!doctype html><title>Product panel host</title><h1>Product panel</h1><iframe title="Product panel" src="${panelOrigin}/window-open" style="width:600px;height:400px"></iframe>`,
      );
      return;
    }
    if (url.pathname === "/nested-opener") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(
        `<!doctype html><title>Nested product</title><script>window.open('/nested-destination', '_blank');</script>`,
      );
      return;
    }
    if (url.pathname === "/redirect-destination") {
      response.writeHead(302, { Location: "/final-destination" });
      response.end();
      return;
    }
    if (url.pathname === "/posted-destination") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          `<!doctype html><title>Form destination</title><output>${new URLSearchParams(body).get("message") === "product-form" ? "product-form" : "missing"}</output>`,
        );
      });
      return;
    }
    if (url.pathname === "/window-open") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><html lang="en"><title>Window-open fixture</title>
        <h1>Product navigation</h1><a href="/destination" id="product">Scripted product link</a><output id="open-result"></output>
        <a href="/plain-destination" target="_blank" rel="noopener">Plain product link</a>
        <button id="nested">Open nested products</button>
        <button id="rapid">Open two products</button>
        <button id="deferred">Open blank then navigate</button>
        <form action="/posted-destination" method="post" target="_blank"><input name="message" value="product-form" type="hidden"><button>Submit product form</button></form>
        <script>
        document.querySelector('#nested').onclick = () => {
          window.open('/first-destination', '_blank');
          window.open('/nested-opener', '_blank');
        };
        document.querySelector('#rapid').onclick = () => {
          window.open('/first-destination', '_blank');
          window.open('/redirect-destination', '_blank');
        };
        document.querySelector('#deferred').onclick = () => {
          const opened = window.open('', '_blank');
          document.querySelector('#open-result').textContent = opened ? 'opened' : 'blocked';
          if (opened) opened.location.href = '/deferred-destination';
        };
        document.querySelector('#product').onclick = (event) => {
          event.preventDefault();
          const opened = window.open(event.currentTarget.href, '_blank');
          document.querySelector('#open-result').textContent = opened ? 'opened' : 'blocked';
          if (!opened) location.href = event.currentTarget.href;
        };
        </script></html>`);
      return;
    }
    if (url.pathname === "/failure") {
      response.writeHead(503);
      response.end("Intentional fixture failure");
      return;
    }
    response.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      // Pages under /strict-csp forbid every style and script the page does not own.
      ...(url.pathname.startsWith("/strict-csp")
        ? { "Content-Security-Policy": "default-src 'none'; style-src 'none'" }
        : {}),
    });
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Verification ${url.pathname.replace(/[^a-z/-]/gi, "")}</title>
      <style>body{font:20px system-ui;background:#e7edf5;color:#172a42;padding:32px}button,input,a{font:inherit;margin:12px;padding:8px}#scroll{height:180px;overflow:auto;border:2px solid}#spacer{height:600px}</style>
      <h1>Local verification page</h1><label>Message <input aria-label="Message"></label><button id="apply">Apply</button><output id="result"></output>
      <p><a href="/child" target="_blank">Open sub-tab</a><button id="popup">Open popup</button><a href="/sample.pdf">Read PDF</a><a href="/pdf-document">Read extensionless document</a><a href="/pdf-redirect">Read redirected document</a><a href="/private-document">Read private document</a><a href="/download">Download fixture</a></p>
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
