let loading = null;
export default function loadHowler() {
  loading ??= new Promise((resolve, reject) => {
    if (window.Howl) {
      resolve({
        Howl: window.Howl,
        Howler: window.Howler,
      });
      return;
    }
    const script = document.createElement(`script`);
    script.src = new URL(`./howler.js`, import.meta.url).href;
    script.onload = () =>
      resolve({
        Howl: window.Howl,
        Howler: window.Howler,
      });
    script.onerror = reject;
    document.head.append(script);
  });
  return loading;
}
