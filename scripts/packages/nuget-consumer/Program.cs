// Serves the static files the application's packages give it, formaui-net.DOMQL's domql.js among them.
var app = WebApplication.CreateBuilder(args).Build();
app.MapStaticAssets();
app.Run();
