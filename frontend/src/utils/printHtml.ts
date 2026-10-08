/**
 * Imprime un document HTML complet (ex. lettre de fermeture) sans quitter la
 * page : iframe invisible → fenêtre d'impression du navigateur (« Enregistrer
 * en PDF » y est offert). L'iframe est retirée après l'impression.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.onload = () => {
    const win = frame.contentWindow;
    if (!win) return;
    win.addEventListener('afterprint', () => frame.remove());
    win.focus();
    win.print();
  };
  frame.srcdoc = html;
  document.body.appendChild(frame);
}
