# Kiểm chứng — 27/10/2026

## Web + Agent preview

- Repo công khai và Pages đã xuất bản sau xác nhận của chủ dự án: https://github.com/thamtrung151/tt-espstudio và https://thamtrung151.github.io/tt-espstudio/.
- Kiểm tra **HTTPS Pages thật → Agent loopback → PlatformIO** bằng Edge 156.0.4314.42: 2/2 bài đạt, bao gồm S3 GPIO38 compile thật và C++ lỗi cố ý. Không flash USB.
- Chrome headless trên HTTPS Pages: bài editor offline, ghép nối, reload và thu hồi phiên cũng đạt (quyền loopback được cấp riêng trong context kiểm thử).
- Headless không bấm được prompt quyền mạng: lượt đầu bị browser từ chối loopback. Bài test dùng `context.grantPermissions(['local-network-access'], {origin})` cho đúng website và context; không tắt bảo mật toàn trình duyệt. Thao tác cấp/từ chối quyền bằng UI trên browser thường vẫn cần thử thủ công.

- Baseline Git 2c67d82 giữ bản 0.2.1 đang chạy; nhánh nâng cấp feature/web-local-agent.
- 29/29 test lõi/API đạt, gồm HTTP server thật kiểm tra Host/Origin, pairing, token, thời hạn, số lần đoán, từ chối request không được phép. Fetch không cho giả Host trong test đầu; ca Host được chuyển sang node:http để kiểm tra header thực.
- 9/9 test UI cũ đạt; hai test firmware của bridge cũ bỏ qua trong lượt hồi quy.
- 2/2 bài browser Agent đạt: web tĩnh vẫn sửa/lưu khi không Agent, ghép nối/thu hồi phiên/reload; ESP32-S3 GPIO38 build thật qua web tĩnh → Agent → PlatformIO thành công, C++ cố ý sai trả error cùng compiler log. Không nạp USB.
- TypeScript, build local và build web tĩnh đạt. Còn cảnh báo bundle Blockly lớn.
- Kết quả trên dùng Edge headless, HTTP preview 3212 và Agent 3217 với PlatformIO sẵn có. Chưa thay thế kiểm tra HTTPS public/Chrome/Windows sạch/bộ cài/USB thật qua Agent.

## Logic thiết bị PWM / motor và cấu hình nháp

- Xóa thông báo lỗi sinh code cũ khi Blockly đã được sửa hợp lệ; placeholder __missing__ được giải thích là block chưa chọn thiết bị. Dropdown hiển thị cả tên và ID.
- Cấu hình GUI/JSON chưa áp dụng khóa build/upload; có nút bỏ bản nháp. Từ chối xóa/đổi loại thiết bị đang được block tham chiếu vẫn giữ cấu hình đã áp dụng, không tự đổi block PWM thành motor. Build kiểm tra lại Blockly trước khi gửi API.
- 26 test lõi đạt, production build đạt. 8 test UI trước đạt; test mới về chọn PWM m1, xóa tham chiếu, bỏ nháp và thêm motor riêng cũng đạt sau sửa selector SVG/menu trong test (tổng 9 test UI). Hai ca firmware opt-in không chạy; không nạp USB.

## Bổ sung highlight và C++ tự do

- Highlight dùng nền riêng dưới textarea, theo dòng và vị trí cuộn, không phụ thuộc focus. Ẩn highlight khi không có mapping hợp lệ hoặc vào C++ tự do.
- Cho chuyển sang C++ tự do ngay cả khi Blockly chưa hợp lệ (ví dụ block tách rời). Giữ code đang hiển thị và snapshot block; báo rõ code chưa phản ánh các thay đổi lỗi. Không dùng mapping cũ để tô nhầm dòng.
- Build đạt; 8 bài UI đạt, gồm highlight hiển thị mà không lấy focus, kéo khối, chuyển C++ với block rời, sửa/lưu qua reload và trở lại Blockly có history. Hai ca firmware opt-in bỏ qua; không nạp USB.

## Sửa kéo khối Blockly — 0.2.1

- Tái hiện lỗi chọn block con làm ô C++ nhận focus giữa thao tác chuột. Bỏ chuyển focus tự động; vẫn cập nhật vùng code tương ứng. Chuyển sang chế độ C++ chủ động vẫn focus editor.
- Test hồi quy thất bại trên bản cũ tại kiểm tra focus, đạt sau sửa. Ba ca kéo bằng chuột tách Serial trong setup, GPIO và wait trong loop ngay sau reload, không thêm block toolbox; xác nhận cấu trúc project đã lưu.
- Production build đạt; 26/26 test lõi và 8/8 test giao diện đạt. Hai test compile firmware opt-in được bỏ qua vì lần này chỉ sửa focus giao diện. Không nạp USB.

## Cập nhật 0.2.1

- Kiểm tra tự động: **26/26 test lõi**, **7/7 bài trình duyệt** khi bật build thật. ESP32 robotics (toàn bộ driver) và ESP32-S3 GPIO33 đều biên dịch thành công qua UI → API → PlatformIO; không nạp USB. Ma trận unit test duyệt GPIO 0–48 cho cả hai target, giữ nguyên số chân và không áp whitelist.
- Production build đạt; UI được kiểm tra thêm sau thay đổi giữ danh sách GPIO khi đổi target. Cảnh báo bundle Blockly lớn vẫn là giới hạn tối ưu tải trang, không phải lỗi build.
- Một lần chạy hồi quy UI bị timeout lúc mở trang có font Google bên ngoài. Đã bỏ tải font mạng (dùng font hệ thống/fallback), build lại và chạy lại: **5/5 test UI đạt**, hai test build thật được skip trong lượt này vì đã đạt trước đó và core/generator không thay đổi. Kiểm tra giữ nguyên GPIO khi đổi target cũng đạt.

- Người dùng đã thử staging v0.2 và báo **ESP32 và ESP32-S3 đều hoạt động**. Chưa có chi tiết module S3 hoặc danh sách ngoại vi đã thử; giữ phạm vi xác nhận đúng mức này.
- Bỏ whitelist GPIO ở cả GUI, schema dùng chung và build API. GPIO ngoài gợi ý, input-only/ADC/UART/flash/USB và dùng chung pin chỉ đưa thông tin, không từ chối cấu hình.
- Giữ số GPIO người dùng chọn xuyên suốt JSON, project, Blockly và C++. Cho phép exposedPins trống; đổi target không thay danh sách GPIO.
- Thư mục chính trước cập nhật là 0.1; staging do người dùng chuyển về chứa 0.2. Bản bàn giao 0.2.1 đồng bộ hai nơi, source chính từ nay ở gốc TT ESPStudio.

## Cập nhật 0.2 — phản hồi phần cứng và driver mới

- Chủ dự án xác nhận build, nạp và Serial thành công trên **DOIT ESP32 DevKit**, cổng **COM6**, USB **Silicon Labs CP210x**. Ảnh gửi kèm thể hiện upload SUCCESS, hash verified và log raw qua Serial. Đây là bằng chứng do người dùng cung cấp, không phải agent tự nạp board.
- Lỗi GPIO2 được truy về whitelist quá hẹp của 0.1. 0.2 cho phép GPIO2 và phân biệt lưu ý strapping với lỗi cấu hình.
- Chưa nhận xác nhận LED GPIO2 hoạt động sau sửa; chưa xác nhận ADC/PWM/servo/motor ngoài đời.
- C++ motor đã chỉnh đúng xác nhận cuối của người dùng: **hai PWM IN1/IN2**, không có chân PWM riêng thứ ba. Board trống không yêu cầu motor/servo.
- `npm test`: **25/25 đạt**. Bao gồm chân GPIO2, input-only/pull, ADC, pin UART0, cấp phát timer, motor hai channel, từ chối chân thứ ba và giữ source ownership.
- `npm run build`: đạt TypeScript + Vite. Còn cảnh báo bundle Blockly >500 kB.
- Browser suite với `ESPSTUDIO_TEST_FIRMWARE=1`: **5/5 đạt**, ~29 giây. Build thật qua UI/API/PlatformIO dùng workspace có toàn bộ driver mới, gồm motor hai PWM và servo. Không nạp USB.
- Các thử nghiệm UI chạy trên bridge riêng **3211**, không dùng lại bridge người dùng ở 3210. Bao gồm GUI GPIO2, project trống, thêm đúng hai pin motor, import/export, code history, reload và mobile layout.
- Ví dụ tái sinh bằng `npm run firmware:robotics`; source và project JSON ở `examples/robotics`. Các pin trong đó là fixture kiểm tra, không được coi là sơ đồ đã xác nhận.

Các mục bên dưới là lịch sử kiểm chứng bản 0.1; tình trạng cập nhật ở trên thay thế những ghi chú “chưa nạp/Serial” của bản cũ.

## Bằng chứng đã thực hiện

- TypeScript + Vite production build: đạt.
- Unit/integration tests cho schema/config, generator, Blockly serialization, code history và boundary build service: đạt (xem kết quả cuối ở phần cập nhật).
- Edge headless: Blockly render thực, giữ manual code qua reload, khóa config trong code mode, lưu lịch sử khi quay về block; sửa GUI/JSON, giữ config cũ khi nhập sai, xuất/nhập project, xuất ZIP; bố cục 390 px không tràn ngang; API từ origin lạ và request thiếu token bị từ chối.
- Firmware sinh từ **workspace Blockly thật + config**, không phải một file Blink viết riêng để vượt qua test. PlatformIO 6.12.0, Arduino core 2.0.17, target `esp32dev` đã build thành công.
- Kết quả build đầu tiên: RAM 21,464 / 327,680 bytes; flash 269,101 / 1,310,720 bytes. File trong `examples/blink/.pio/build/robot/` trên máy build; build artifacts không phải source cần đưa vào Git.

## Chưa kiểm chứng

- Nạp firmware và hành vi LED thực trên ESP32 DevKit/WROOM.
- Serial monitor với cổng USB thật, rút thiết bị giữa chừng, driver COM và nút BOOT.
- ESP32-S3 (cả compile và phần cứng); template chỉ thể hiện khả năng mở rộng bằng config.
- Hiệu năng với workspace lớn, trình duyệt ngoài Edge, Linux/macOS và mobile USB.

Không có mô phỏng LED hoặc upload giả để thay bằng chứng phần cứng. Build thành công không đồng nghĩa đã nạp/chạy thành công.

## Kết quả kiểm tra cuối

- `npm test`: **14/14 đạt** (11 core + 3 build boundary).
- `npm run build`: đạt. Vite cảnh báo bundle Blockly lớn hơn 500 kB; chưa tối ưu chia bundle trong bản khởi đầu.
- `ESPSTUDIO_TEST_FIRMWARE=1 npm run test:browser`: **4/4 đạt**, tổng khoảng 31 giây. Ca thực tế bấm Biên dịch qua UI → HTTP API → PlatformIO → firmware thành công; sau khi sửa C++, UI yêu cầu build lại và không cho nạp bản cũ.
- Bổ sung kiểm tra không âm thầm đổi ID thiết bị khi load Blockly, và từ chối xóa/đổi ID đang được block dùng.
- Ảnh kiểm tra bố cục: `docs/screenshots/studio-desktop.png`, `docs/screenshots/studio-mobile.png`. Ảnh lấy từ test thao tác config nên có thể hiển thị GPIO25/custom board; ví dụ mặc định vẫn là ESP32 DevKit, LED ngoài GPIO23.
- Bản bàn giao gồm source, lockfile, dependencies và dist. Các cache/build job ở thư mục staging không được sao chép; có thể tái build bằng UI hoặc ví dụ PlatformIO.

## Cách chạy lại

Xem các lệnh trong README. Chạy `npm run firmware:example` để tái sinh source ví dụ; sau đó chạy `pio run` trong `examples/blink`. Đặt `ESPSTUDIO_TEST_FIRMWARE=1` khi chạy browser tests để thực sự bấm build qua UI/API/PlatformIO; mặc định bỏ qua ca này để test giao diện không cần toolchain.
