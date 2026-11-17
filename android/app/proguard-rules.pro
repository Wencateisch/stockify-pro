# Socket.IO / engine.io use reflection internally.
-keep class io.socket.** { *; }
-keep class io.engine.** { *; }
-dontwarn io.socket.**
-dontwarn io.engine.**
