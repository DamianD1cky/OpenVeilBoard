export const paperColors = {
  yellow: "#eee4cb",
  blue: "#d8e0df",
  pink: "#ebd3ca",
  green: "#d8dfd0",
};
export const paperOptions = [
  ["yellow", "米黄"],
  ["#f1ede2", "米白"],
  ["blue", "灰蓝"],
  ["pink", "淡红"],
  ["green", "浅绿"],
  ["#ceb38a", "牛皮纸"],
  ["#8a3e35", "暗红"],
];
export function paperColor(color) {
  return (
    paperColors[color] ??
    (/^#[\da-f]{6}$/i.test(color) ? color : paperColors.yellow)
  );
}
export function darkPaper(color) {
  const c = paperColor(color);
  return (
    parseInt(c.slice(1, 3), 16) * 0.2126 +
      parseInt(c.slice(3, 5), 16) * 0.7152 +
      parseInt(c.slice(5, 7), 16) * 0.0722 <
    120
  );
}
