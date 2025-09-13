import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
dayjs.extend(duration);

/**
 * 生成带随机偏差的实际运行时间
 * @param {string} planTimeStr - 计划运行时间 "HH:mm:ss"
 * @param {number} deviationSeconds - 偏差范围 ±秒数，默认 ±120 秒
 * @returns {{realTimeStr: string, realSeconds: number}}
 */
export function getRealRunningTime(planTimeStr, deviationSeconds = 120) {
  // 解析 "HH:mm:ss" -> 秒数
  const [h, m, s] = planTimeStr.split(':').map(Number);
  const planSeconds = (h || 0) * 3600 + (m || 0) * 60 + (s || 0);

  // 偏差范围 ±deviationSeconds
  const deviation = Math.floor(Math.random() * (deviationSeconds * 2 + 1)) - deviationSeconds;

  const realSeconds = Math.max(0, planSeconds + deviation);

  // 格式化 HH:mm:ss
  const hours = Math.floor(realSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((realSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = Math.floor(realSeconds % 60).toString().padStart(2, '0');
  const realTimeStr = `${hours}:${minutes}:${seconds}`;

  return { realTimeStr, realSeconds };
}


/**
 * 返回时间区间
 * @param start
 * @param end
 * @returns {Date}
 */
export function randomDate(start, end) {
  const diff = end.getTime() - start.getTime();
  const ts = start.getTime() + Math.random() * diff;
  return new Date(ts);
}
