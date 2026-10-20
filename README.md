# 보석타워 플레이 테스트

기존 uzmap-forge의 1인 플레이 화면을 GitHub Pages에서 엽니다.

## 테스트

공개 화면에서 본인이 보유한 GemTower_Max_7C.w3x와 기존 1.28.5.7680
unit-abilities.json을 선택하세요. 파일은 방문 기기의 메모리에서 읽으며
서버에 전송하지 않습니다. 링크에 원본 맵·설치 자료가 포함되지 않습니다.
파일의 정확한 판본을 확인한 뒤 레이스 → 이지 → 빈 칸 건설로 진행합니다.
현재 멀티 네트워크와 실물 휴대폰 검증은 별도입니다.

페이지를 다시 열면 원본 자료를 다시 선택합니다. 같은 브라우저·주소에
저장한 조작 기록은 동일 빌드·시드·자료 판본에서만 이어할 수 있습니다.

## 빌드·배포

Node 22.22.3에서 아래 명령을 실행합니다. 런타임 의존성 설치는 필요 없습니다.

```sh
node --experimental-strip-types --test test/web/source-input.test.ts test/scripts/pages-package.test.ts test/scripts/web-build-version.test.ts
node scripts/build-web.mjs
node scripts/package-pages.mjs
```

공개 저장소에는 엔진 소스·뷰어·기존 대체 그래픽만 있습니다. 원본 맵,
Blizzard 설치 자료 및 추출 프로필, 원본 문자열 원장, 개인 저장 기록은
저장소와 배포 묶음 모두에서 제외합니다. 폰트 라이선스는
web/assets/fonts/OFL.txt를 보존합니다.

Pages source는 GitHub Actions입니다. main push 또는 Publish test viewer
수동 실행 시 검증·빌드 후 .site만 게시합니다. 세부 사항은
[배포 안내](docs/PAGES_DEPLOY.md)를 참고하세요.
