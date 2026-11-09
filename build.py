# Builds poststart.js from the sources: the weather & clock code, then the maps code with the chest list.
import pathlib
d = pathlib.Path(__file__).parent
weather = (d / "src/weather.js").read_text()
maps = (d / "src/maps.js").read_text().replace("/*CHESTS*/\n", (d / "src/chests.js").read_text())
extras = (d / "src/extras.js").read_text()
(d / "poststart.js").write_text(weather.rstrip() + "\n\n" + maps.rstrip() + "\n\n" + extras)
print("built poststart.js")
