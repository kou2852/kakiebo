// 画面の上に重ねる案内（アップデートの案内 UpdatePrompt・更新情報とレビューのお願い UpdatesOverlay）が、
// 同時に出ないようにする印。先に出ているほうが閉じるまで、あとのほうは待つ。
const open = {};
export const setOverlayOpen = (name, v) => { open[name] = v; };
export const isOverlayOpen = (name) => !!open[name];
