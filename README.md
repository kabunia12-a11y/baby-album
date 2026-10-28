# 아기 앨범

앨범에서 고른 가족 영상을 18개월 전후 아기를 위한 반응형 놀이로 바꿔 주는 웹앱입니다.
아기가 웃고, 손 흔들고, 옹알이하고, 화면을 터치하면 영상 속 엄마가 그에 맞는 장면으로 반응해요.

바로 쓰기: https://kabunia12-a11y.github.io/baby-album/

- 부모가 할 일: 영상 고르기, 폰 세워 두기, 시작 누르기
- 영상 분석, 얼굴·손 인식, 소리 감지는 모두 기기 안에서 처리합니다 (MediaPipe Tasks Vision)
- 영상과 카메라 화면은 서버로 보내지 않고, 영상은 브라우저(IndexedDB)에만 저장합니다

## 구조

- `app/` — 배포되는 정적 웹앱 (GitHub Pages에서 이 폴더를 서비스)
  - `app.js` — 영상 분석, 실시간 인식, 놀이 진행
  - `sw.js` — 오프라인 캐시 (앱 파일, 인식 모델)
- `baby-album.html` — 처음 만든 수동 질문 방식 프로토타입 (참고용)

## 로컬 실행

```bash
python -m http.server 8765 --directory app
```

카메라는 HTTPS 또는 localhost에서만 켜집니다.
