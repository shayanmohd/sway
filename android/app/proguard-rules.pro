# JS bridge: the WebView calls these by name via reflection.
-keepclassmembers class com.mohdshayan.sway.MainActivity$Native { public *; }
-keep class com.mohdshayan.sway.MainActivity$Native { *; }
