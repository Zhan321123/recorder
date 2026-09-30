// lunar-javascript 未附带类型定义，这里只声明用到的最小 API 面
declare module "lunar-javascript" {
  export class Holiday {
    getName(): string;
    /** true=调休上班（班），false=放假（休） */
    isWork(): boolean;
  }
  export class Lunar {
    /** 农历月（中文），如 "八月" */
    getMonthInChinese(): string;
    /** 农历日（中文），如 "廿一"、"初一" */
    getDayInChinese(): string;
    /** 节气名，非节气日返回空串 */
    getJieQi(): string;
    getFestivals(): string[];
    /** 农历月数字（闰月为负值） */
    getMonth(): number;
    getDay(): number;
  }
  export class Solar {
    static fromYmd(y: number, m: number, d: number): Solar;
    getLunar(): Lunar;
    getFestivals(): string[];
  }
  export class HolidayUtil {
    /** 法定节假日/调休信息；普通日期返回 null */
    static getHoliday(y: number, m: number, d: number): Holiday | null;
  }
}
