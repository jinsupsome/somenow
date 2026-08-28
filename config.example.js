/*
 * Somenow 설정 예시
 *
 * 사용법:
 *   1) 이 파일을 같은 폴더에 config.js 라는 이름으로 복사한다.
 *   2) UNSPLASH_ACCESS_KEY 값을 본인의 Unsplash Access Key로 바꾼다.
 *      (https://unsplash.com/oauth/applications 에서 앱 등록 후 발급)
 *   3) config.js 는 .gitignore 에 있으므로 커밋되지 않는다. 절대 커밋하지 말 것.
 *
 * config.js 가 없어도 확장 프로그램은 동작한다.
 * 이 경우 API를 호출하지 않고, 저장된 마지막 사진이나 단색 배경을 쓴다.
 */
var SOMENOW_CONFIG = {
  UNSPLASH_ACCESS_KEY: "YOUR_UNSPLASH_ACCESS_KEY_HERE"
};
