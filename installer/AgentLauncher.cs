using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Principal;
using System.Threading;
using System.Windows.Forms;

internal sealed class AgentTray : ApplicationContext {
    private const string Website = "https://thamtrung151.github.io/tt-espstudio/";
    private readonly NotifyIcon icon;
    private readonly Process agent;
    private readonly string logFile;
    private readonly object logLock = new object();
    private readonly Control dispatcher = new Control();
    private bool closing;

    [STAThread]
    private static void Main(string[] args) {
        // Protocol activation never accepts arbitrary websites, files or commands.
        if (args.Length > 1 || (args.Length == 1 && args[0] != "--open" && args[0] != "ttespstudio://connect" && args[0] != "ttespstudio://connect/")) return;
        Application.EnableVisualStyles();
        bool openWeb = args.Length == 1 && args[0] == "--open";
        bool first;
        using (var mutex = new Mutex(true, "Local\\TTESPStudioAgent", out first)) {
            if (!first) { if (openWeb) OpenWebsite(); return; }
            try { Application.Run(new AgentTray(openWeb)); }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Không mở được TT ESPStudio Agent", MessageBoxButtons.OK, MessageBoxIcon.Error); }
        }
    }
    private static void OpenWebsite() { Process.Start(new ProcessStartInfo(Website) { UseShellExecute = true }); }
    private AgentTray(bool openWeb) {
        var app = AppDomain.CurrentDomain.BaseDirectory;
        var data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TTESPStudio", "agent");
        foreach (var file in new[] { "node.exe", "agent.cjs", "consent.ps1", "python\\python.exe" })
            if (!File.Exists(Path.Combine(app, file))) throw new FileNotFoundException("Bộ cài thiếu " + file + ". Hãy cài lại Agent.");
        Directory.CreateDirectory(data);
        logFile = Path.Combine(data, "agent.log");
        dispatcher.CreateControl();
        var menu = new ContextMenuStrip();
        menu.Items.Add("Mở ESPStudio", null, (s, e) => OpenWebsite());
        menu.Items.Add("Xem log", null, (s, e) => Process.Start(new ProcessStartInfo("notepad.exe", "\"" + logFile + "\"") { UseShellExecute = false }));
        menu.Items.Add("Thoát Agent", null, (s, e) => RequestExit());
        icon = new NotifyIcon { Icon = SystemIcons.Application, Text = "TT ESPStudio Agent", ContextMenuStrip = menu, Visible = true };
        icon.DoubleClick += (s, e) => OpenWebsite();
        var start = new ProcessStartInfo(Path.Combine(app, "node.exe"), "\"" + Path.Combine(app, "agent.cjs") + "\"") {
            WorkingDirectory = app, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8, StandardErrorEncoding = System.Text.Encoding.UTF8
        };
        // Do not allow inherited developer flags to change packaged trust boundaries.
        foreach (var key in new[] { "NODE_OPTIONS", "NODE_PATH", "ESPSTUDIO_PIO", "ESPSTUDIO_AGENT_DEV", "ESPSTUDIO_AGENT_PORT", "ESPSTUDIO_AGENT_ORIGINS" }) start.EnvironmentVariables.Remove(key);
        start.EnvironmentVariables["ESPSTUDIO_AGENT_RUNTIME"] = app;
        start.EnvironmentVariables["ESPSTUDIO_AGENT_DATA"] = data;
        start.EnvironmentVariables["ESPSTUDIO_AGENT_PARENT_PIPE"] = "1";
        agent = new Process { StartInfo = start, EnableRaisingEvents = true };
        agent.OutputDataReceived += Output; agent.ErrorDataReceived += Output;
        agent.Exited += (s, e) => dispatcher.BeginInvoke((Action)(() => {
            if (!closing) MessageBox.Show("Agent đã dừng. Xem log để kiểm tra runtime hoặc cổng 3217 đang bận.", "TT ESPStudio Agent");
            icon.Visible = false; ExitThread();
        }));
        agent.Start(); agent.BeginOutputReadLine(); agent.BeginErrorReadLine();
        if (openWeb) OpenWebsite();
    }
    private void Output(object sender, DataReceivedEventArgs e) {
        if (e.Data == null) return;
        try {
            lock (logLock) {
                if (File.Exists(logFile) && new FileInfo(logFile).Length > 1024 * 1024) File.WriteAllText(logFile, "Log mới\r\n");
                File.AppendAllText(logFile, e.Data + Environment.NewLine, System.Text.Encoding.UTF8);
            }
        } catch (IOException) { /* disk full does not stop a firmware operation */ }
        if (e.Data == "ESPSTUDIO_SHUTDOWN_BUSY") dispatcher.BeginInvoke((Action)(() => {
            closing = false;
            MessageBox.Show("Đang build/nạp hoặc chờ xác nhận nạp. Hãy hoàn tất tác vụ trước khi thoát.", "TT ESPStudio Agent");
        }));
    }
    private void RequestExit() {
        if (closing) return;
        if (agent.HasExited) { ExitThread(); return; }
        closing = true;
        try { agent.StandardInput.WriteLine("shutdown"); agent.StandardInput.Flush(); }
        catch (IOException) { closing = false; }
    }
    protected override void Dispose(bool disposing) {
        if (disposing) { icon.Dispose(); dispatcher.Dispose(); agent.Dispose(); }
        base.Dispose(disposing);
    }
}
