// Read-only Win32 geometry for the local recorder. No input injection or permission changes.
using System;
using System.Text;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
public class Frame01CaptureWindow {
 public long hwnd; public int pid; public string title; public string process;
 public int width; public int height; public int outerWidth; public int outerHeight; public bool minimized; public bool foreground;
 public long captureHwnd; public int captureWidth; public int captureHeight;
}
public static class Frame01CaptureWindows {
 public delegate bool Visitor(IntPtr h, IntPtr l);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left,top,right,bottom; }
 [DllImport("user32.dll")] static extern bool EnumWindows(Visitor v,IntPtr l);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,Visitor v,IntPtr l);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern bool SetWindowText(IntPtr h,string text);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags);
 [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h,uint message,IntPtr w,IntPtr l);
 public static Frame01CaptureWindow[] List() {
  var rows=new List<Frame01CaptureWindow>(); var front=GetForegroundWindow();
  EnumWindows((h,l)=>{
   if(!IsWindowVisible(h))return true;
   uint pid; GetWindowThreadProcessId(h,out pid); string process;
   try { process=Process.GetProcessById((int)pid).ProcessName; } catch { return true; }
   if(!String.Equals(process,"chrome",StringComparison.OrdinalIgnoreCase))return true;
   var title=new StringBuilder(2048); GetWindowText(h,title,title.Capacity);
   if(title.Length==0)return true;
   Rect r,outer; if(!GetClientRect(h,out r)||!GetWindowRect(h,out outer))return true;
   var row=new Frame01CaptureWindow { hwnd=h.ToInt64(),pid=(int)pid,title=title.ToString(),process=process,width=r.right,height=r.bottom,outerWidth=outer.right-outer.left,outerHeight=outer.bottom-outer.top,minimized=IsIconic(h),foreground=h==front,captureHwnd=h.ToInt64(),captureWidth=r.right,captureHeight=r.bottom };
   long area=0;
   EnumChildWindows(h,(child,unused)=>{
    var name=new StringBuilder(256); GetClassName(child,name,name.Capacity);
    Rect cr; if(name.ToString()=="Chrome_RenderWidgetHostHWND"&&IsWindowVisible(child)&&GetClientRect(child,out cr)) {
     long a=(long)cr.right*cr.bottom;
     if(a>area&&cr.right>=320&&cr.bottom>=180&&cr.right<=r.right&&cr.bottom<=r.bottom) { area=a;row.captureHwnd=child.ToInt64();row.captureWidth=cr.right;row.captureHeight=cr.bottom; }
    } return true;
   },IntPtr.Zero);
   rows.Add(row);return true;
  },IntPtr.Zero);return rows.ToArray();
 }
 public static void Main(string[] args) {
  SetProcessDPIAware();
  if(args.Length==3&&args[0]=="--close-obs") {
   int pid=int.Parse(args[1]);var process=Process.GetProcessById(pid);
   if(process.ProcessName!="obs64"||!String.Equals(process.MainModule.FileName,args[2],StringComparison.OrdinalIgnoreCase))throw new Exception("Not the owned OBS recorder.");
   bool sent=false;EnumWindows((h,l)=>{uint p;GetWindowThreadProcessId(h,out p);var title=new StringBuilder(256);GetWindowText(h,title,title.Capacity);if(p==pid&&title.ToString().Contains("OBS")){PostMessage(h,0x10,IntPtr.Zero,IntPtr.Zero);sent=true;return false;}return true;},IntPtr.Zero);
   if(!sent)throw new Exception("Owned OBS recording window not found.");return;
  }
  if(args.Length==4&&args[0]=="--size") {
   long id=long.Parse(args[1]);int width=int.Parse(args[2]),height=int.Parse(args[3]);
   if(width<640||width>7680||height<480||height>4320)throw new Exception("Invalid recording window dimensions.");
   var match=Array.Find(List(),w=>w.hwnd==id);if(match==null)throw new Exception("Observed Chrome window no longer exists.");
   if(!SetWindowPos(new IntPtr(id),IntPtr.Zero,0,0,width,height,0x16))throw new Exception("Chrome recording window could not be sized.");
  }
  if(args.Length==3&&args[0]=="--label") {
   long id=long.Parse(args[1]);if(Array.Find(List(),w=>w.hwnd==id)==null)throw new Exception("Observed Chrome window no longer exists.");
   if(!SetWindowText(new IntPtr(id),args[2]))throw new Exception("Recording window label could not be set.");
  }
  Console.OutputEncoding=Encoding.UTF8;Console.Write(new JavaScriptSerializer().Serialize(List()));
 }
}
