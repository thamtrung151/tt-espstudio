export function uploadDiagnostic(log:string):string|undefined {
  if(!/Cannot configure port|device which does not exist|SerialException/i.test(log))return;
  if(/Hash of data verified\.[\s\S]*?(?:Leaving\.\.\.|Hard resetting)[\s\S]*?(?:Cannot configure port|device which does not exist|SerialException)/i.test(log))
    return 'Toolchain đã xác minh dữ liệu rồi mất cổng ở bước kết thúc/reset. Web đang thử mở lại Serial; nếu chương trình đã chạy thì không cần nhấn RST. Toolchain vẫn trả lỗi nên chưa xác nhận toàn bộ lượt nạp thành công.';
  return 'Mất cổng USB/Serial trước khi hoàn tất; chưa xác nhận nạp hoàn tất. Chờ USB xuất hiện lại rồi thử nạp. Chỉ dùng BOOT + RST nếu board không tự vào chế độ nạp.';
}
