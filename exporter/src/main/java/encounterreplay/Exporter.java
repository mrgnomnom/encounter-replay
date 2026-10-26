package encounterreplay;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.Writer;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.BiFunction;
import net.runelite.cache.ConfigType;
import net.runelite.cache.IndexType;
import net.runelite.cache.definitions.FrameDefinition;
import net.runelite.cache.definitions.FramemapDefinition;
import net.runelite.cache.definitions.ItemDefinition;
import net.runelite.cache.definitions.KitDefinition;
import net.runelite.cache.definitions.MapDefinition;
import net.runelite.cache.definitions.ModelDefinition;
import net.runelite.cache.definitions.NpcDefinition;
import net.runelite.cache.definitions.ObjectDefinition;
import net.runelite.cache.definitions.OverlayDefinition;
import net.runelite.cache.definitions.SequenceDefinition;
import net.runelite.cache.definitions.SpotAnimDefinition;
import net.runelite.cache.definitions.SpriteDefinition;
import net.runelite.cache.definitions.TextureDefinition;
import net.runelite.cache.definitions.UnderlayDefinition;
import net.runelite.cache.definitions.loaders.FrameLoader;
import net.runelite.cache.definitions.loaders.FramemapLoader;
import net.runelite.cache.definitions.loaders.ItemLoader;
import net.runelite.cache.definitions.loaders.KitLoader;
import net.runelite.cache.definitions.loaders.MapLoader;
import net.runelite.cache.definitions.loaders.ModelLoader;
import net.runelite.cache.definitions.loaders.NpcLoader;
import net.runelite.cache.definitions.loaders.ObjectLoader;
import net.runelite.cache.definitions.loaders.OverlayLoader;
import net.runelite.cache.definitions.loaders.SequenceLoader;
import net.runelite.cache.definitions.loaders.SpotAnimLoader;
import net.runelite.cache.definitions.loaders.SpriteLoader;
import net.runelite.cache.definitions.loaders.TextureLoader;
import net.runelite.cache.definitions.loaders.UnderlayLoader;
import net.runelite.cache.fs.Archive;
import net.runelite.cache.fs.ArchiveFiles;
import net.runelite.cache.fs.FSFile;
import net.runelite.cache.fs.Index;
import net.runelite.cache.fs.Storage;
import net.runelite.cache.fs.Store;
import net.runelite.cache.region.Region;

/**
 * Reads an Encounter Recorder session, finds every NPC, object, item, body part, graphic and animation
 * it uses, and writes what the game cache says about them into one bundle the replay engine loads:
 * definitions, models, animation frames, texture colours and, for instances, ground colours.
 *
 * The bundle is made from Jagex's game cache. It is for local replays only and is never published.
 *
 *   Exporter <cache dir> <session.jsonl> <out.bundle.json>
 */
public class Exporter
{
	private final Store store;
	private final Storage storage;
	private final Gson gson = new GsonBuilder().create();

	private final Set<Integer> npcIds = new TreeSet<>();
	private final Set<Integer> objectIds = new TreeSet<>();
	private final Set<Integer> itemIds = new TreeSet<>();
	private final Set<Integer> kitIds = new TreeSet<>();
	private final Set<Integer> spotIds = new TreeSet<>();
	private final Set<Integer> sequenceIds = new TreeSet<>();
	private final Set<Integer> modelIds = new TreeSet<>();
	private final Set<Integer> textureIds = new TreeSet<>();
	private final Set<Integer> skeletalIds = new TreeSet<>();
	// Overhead icons: prayers (440) and skulls (439), plus any other group an NPC's head icon names
	private final Set<Integer> spriteGroups = new TreeSet<>(java.util.List.of(439, 440));
	// Items seen in your inventory and equipment, with the stack sizes seen (some items look different by stack)
	private final Map<Integer, Set<Integer>> heldItems = new HashMap<>();
	private final Set<Integer> widgetSprites = new TreeSet<>();
	/**
	 * Interface sprites for drawing the side panel as in game, by their names in RuneLite's gameval
	 * SpriteID: the tab icons, prayers lit and dim plus the active glow, equipment slots, orbs and the
	 * panel's stone
	 */
	private static final int[] UI_SPRITES = {
		// SideiconsInterface: combat, stats, quests, inventory, equipment, prayer, magic, chat channel,
		// friends, ignores, logout, options, emotes, music, clan, character summary
		774, 775, 776, 777, 778, 779, 780, 781, 782, 783, 784, 785, 786, 787, 2307, 2309,
		// SideiconsInterface magic tab for the ancient, lunar and arceuus spellbooks
		1583, 1584, 1711,
		// Prayeron, Prayeroff and Prayerglow.ACTIVATED
		115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134,
		502, 503, 504, 505, 945, 946, 947, 1420, 1421, 1422, 1423,
		135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154,
		506, 507, 508, 509, 949, 950, 951, 1424, 1425, 1426, 1427, 4892,
		// Wornicons, and Miscgraphics EQUIPMENT_SLOT_TILE and EQUIPMENT_SLOT_SELECTED
		156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 170, 179,
		// SIDE_BACKGROUND and its edges, SideStoneHighlights, Tabs
		1031, 1032, 1033, 1034, 1035, 1036, 1026, 1027, 1028, 1029, 1030, 952, 953,
		// OrbFrame, OrbFiller, OrbIcon
		1071, 1072, 1059, 1060, 1061, 1062, 1063, 1064, 1065, 1066, 1102, 1607, 1608,
		1058, 1067, 1068, 1069, 1070, 1610,
	};
	private final List<JsonObject> scenes = new ArrayList<>();
	private int revision = -1;

	Exporter(File cacheDir) throws IOException
	{
		store = new Store(cacheDir);
		store.load();
		storage = store.getStorage();
	}

	public static void main(String[] args) throws IOException
	{
		if (args.length != 3)
		{
			System.err.println("Usage: Exporter <cache dir> <session.jsonl> <out.bundle.json>");
			System.exit(2);
		}
		Exporter exporter = new Exporter(new File(args[0]));
		exporter.readSession(new File(args[1]));
		exporter.write(new File(args[2]));
	}

	// ---------- what the session uses ----------

	private void readSession(File session) throws IOException
	{
		try (BufferedReader reader = Files.newBufferedReader(session.toPath(), StandardCharsets.UTF_8))
		{
			String raw;
			while ((raw = reader.readLine()) != null)
			{
				if (raw.isBlank())
				{
					continue;
				}
				JsonObject line;
				try
				{
					line = JsonParser.parseString(raw).getAsJsonObject();
				}
				catch (RuntimeException e)
				{
					continue;
				}
				collect(line);
			}
		}
		System.out.printf("Session uses %d NPCs, %d objects, %d items, %d body kits, %d graphics, %d animations, %d map loads%n",
			npcIds.size(), objectIds.size(), itemIds.size(), kitIds.size(), spotIds.size(), sequenceIds.size(), scenes.size());
	}

	private void collect(JsonObject line)
	{
		switch (str(line, "e"))
		{
			case "header":
				revision = integer(line, "revision", -1);
				break;
			case "npcdef":
				JsonObject def = line.getAsJsonObject("def");
				npcIds.add(integer(def, "id", -1));
				if (def.has("baseId"))
				{
					npcIds.add(integer(def, "baseId", -1));
				}
				break;
			case "npc_spawn":
			case "npc_changed":
				npcIds.add(refId(line.get("who")));
				if (line.has("from"))
				{
					npcIds.add(integer(line, "from", -1));
				}
				if (line.has("overrides"))
				{
					ints(line.getAsJsonObject("overrides").get("models"), modelIds);
				}
				break;
			case "tick":
				for (String group : new String[]{"npcs", "players"})
				{
					if (line.has(group))
					{
						for (JsonElement actor : line.getAsJsonArray(group))
						{
							actor(actor.getAsJsonObject());
						}
					}
				}
				if (line.has("me"))
				{
					actor(line.getAsJsonObject("me"));
				}
				break;
			case "anim":
				sequenceIds.add(integer(line, "a", -1));
				break;
			case "moves":
				ints(line.get("anims"), sequenceIds);
				break;
			case "spot":
				for (JsonElement s : line.getAsJsonArray("spot"))
				{
					spotIds.add(integer(s.getAsJsonObject(), "id", -1));
				}
				break;
			case "gfx":
			case "proj":
				spotIds.add(integer(line, "id", -1));
				break;
			case "obj":
				objectIds.add(integer(line, "id", -1));
				if (line.has("anim"))
				{
					sequenceIds.add(integer(line, "anim", -1));
				}
				break;
			case "look":
			{
				int itemOffset = integer(line, "itemOffset", 2048);
				int kitOffset = integer(line, "kitOffset", 256);
				for (JsonElement e : line.getAsJsonArray("equip"))
				{
					int v = e.getAsInt();
					if (v >= itemOffset)
					{
						itemIds.add(v - itemOffset);
					}
					else if (v >= kitOffset)
					{
						kitIds.add(v - kitOffset);
					}
				}
				if (line.has("npc"))
				{
					npcIds.add(integer(line, "npc", -1));
				}
				break;
			}
			case "ui_widgets":
				// Interface snapshots: their sprites and item icons
				for (JsonElement e : line.getAsJsonArray("widgets"))
				{
					JsonArray w = e.getAsJsonArray();
					if (w.get(5).getAsInt() > 0)
					{
						widgetSprites.add(w.get(5).getAsInt());
					}
					if (w.get(9).getAsInt() > 0)
					{
						heldItems.computeIfAbsent(w.get(9).getAsInt(), k -> new TreeSet<>()).add(Math.max(1, w.get(10).getAsInt()));
					}
				}
				break;
			case "item":
				// Ground items: drawn with their inventory model
				itemIds.add(integer(line, "id", -1));
				break;
			case "items":
				for (JsonElement e : line.getAsJsonArray("items"))
				{
					int id = e.getAsJsonArray().get(0).getAsInt();
					if (id > 0)
					{
						itemIds.add(id);
						heldItems.computeIfAbsent(id, k -> new TreeSet<>()).add(e.getAsJsonArray().get(1).getAsInt());
					}
				}
				break;
			case "scene":
				scenes.add(line);
				break;
			default:
				break;
		}
	}

	private void actor(JsonObject a)
	{
		if (a.has("who"))
		{
			int id = refId(a.get("who"));
			if (id >= 0)
			{
				npcIds.add(id);
			}
		}
		sequenceIds.add(integer(a, "a", -1));
		sequenceIds.add(integer(a, "pose", -1));
		if (a.has("spot"))
		{
			for (JsonElement s : a.getAsJsonArray("spot"))
			{
				spotIds.add(integer(s.getAsJsonObject(), "id", -1));
			}
		}
		if (a.has("head") && a.get("head").isJsonArray())
		{
			for (JsonElement icon : a.getAsJsonArray("head"))
			{
				spriteGroups.add(icon.getAsJsonArray().get(0).getAsInt());
			}
		}
	}

	// ---------- cache access ----------

	private <T> Map<Integer, T> loadConfig(ConfigType type, Set<Integer> wanted, BiFunction<Integer, byte[], T> load) throws IOException
	{
		Index index = store.getIndex(IndexType.CONFIGS);
		Archive archive = index.getArchive(type.getId());
		ArchiveFiles files = archive.getFiles(storage.loadArchive(archive));
		Map<Integer, T> out = new LinkedHashMap<>();
		for (FSFile file : files.getFiles())
		{
			if (wanted == null || wanted.contains(file.getFileId()))
			{
				out.put(file.getFileId(), load.apply(file.getFileId(), file.getContents()));
			}
		}
		return out;
	}

	private int configRevision(ConfigType type)
	{
		return store.getIndex(IndexType.CONFIGS).getArchive(type.getId()).getRevision();
	}

	private byte[] group(IndexType type, int id) throws IOException
	{
		Archive archive = store.getIndex(type).getArchive(id);
		if (archive == null)
		{
			return null;
		}
		byte[] data = storage.loadArchive(archive);
		return data == null ? null : archive.decompress(data);
	}

	// ---------- writing ----------

	private void write(File out) throws IOException
	{
		JsonObject bundle = new JsonObject();
		bundle.addProperty("format", 1);
		bundle.addProperty("sessionRevision", revision);
		bundle.addProperty("note", "Made from the game cache for local replays only. Do not publish.");

		// Open-world map loads get their ground, heights and objects from the cache; their objects need
		// definitions and models like any other, so this runs first
		prepareOpenWorld();

		NpcLoader npcLoader = new NpcLoader().configureForRevision(configRevision(ConfigType.NPC));
		Map<Integer, NpcDefinition> npcs = loadConfig(ConfigType.NPC, npcIds, npcLoader::load);
		ObjectLoader objectLoader = new ObjectLoader().configureForRevision(configRevision(ConfigType.OBJECT));
		Map<Integer, ObjectDefinition> objects = loadConfig(ConfigType.OBJECT, objectIds, objectLoader::load);
		ItemLoader itemLoader = new ItemLoader();
		Map<Integer, ItemDefinition> items = loadConfig(ConfigType.ITEM, itemIds, itemLoader::load);
		// Items that look different by stack size (coins, arrows) point at other items for each size
		Set<Integer> variants = new TreeSet<>();
		for (ItemDefinition d : items.values())
		{
			if (d.countObj != null)
			{
				for (int v : d.countObj)
				{
					if (v > 0 && !items.containsKey(v))
					{
						variants.add(v);
					}
				}
			}
		}
		if (!variants.isEmpty())
		{
			items.putAll(loadConfig(ConfigType.ITEM, variants, itemLoader::load));
		}
		KitLoader kitLoader = new KitLoader();
		Map<Integer, KitDefinition> kits = loadConfig(ConfigType.IDENTKIT, kitIds, kitLoader::load);
		SpotAnimLoader spotLoader = new SpotAnimLoader();
		Map<Integer, SpotAnimDefinition> spots = loadConfig(ConfigType.SPOTANIM, spotIds, spotLoader::load);

		JsonObject npcJson = new JsonObject();
		for (NpcDefinition n : npcs.values())
		{
			JsonObject o = new JsonObject();
			o.addProperty("name", n.name);
			o.addProperty("size", n.size);
			o.add("models", intArray(n.models));
			addModels(n.models);
			recolors(o, n.recolorToFind, n.recolorToReplace, n.retextureToFind, n.retextureToReplace);
			o.addProperty("widthScale", n.widthScale);
			o.addProperty("heightScale", n.heightScale);
			o.add("anims", intArray(new int[]{n.standingAnimation, n.walkingAnimation, n.runAnimation,
				n.rotate180Animation, n.rotateLeftAnimation, n.rotateRightAnimation}));
			for (int a : new int[]{n.standingAnimation, n.walkingAnimation, n.runAnimation})
			{
				sequenceIds.add(a);
			}
			npcJson.add(String.valueOf(n.getId()), o);
		}
		bundle.add("npcs", npcJson);

		JsonObject objectJson = new JsonObject();
		for (ObjectDefinition d : objects.values())
		{
			JsonObject o = new JsonObject();
			o.addProperty("name", d.getName());
			o.add("models", intArray(d.getObjectModels()));
			o.add("types", intArray(d.getObjectTypes()));
			addModels(d.getObjectModels());
			o.addProperty("sizeX", d.getSizeX());
			o.addProperty("sizeY", d.getSizeY());
			o.add("scale", intArray(new int[]{d.getModelSizeX(), d.getModelSizeHeight(), d.getModelSizeY()}));
			// Offsets are signed 16-bit values that the cache library reads as unsigned
			o.add("offset", intArray(new int[]{(short) d.getOffsetX(), (short) d.getOffsetHeight(), (short) d.getOffsetY()}));
			o.addProperty("mirror", d.isRotated());
			o.addProperty("contoured", d.getContouredGround());
			o.addProperty("decorDisplacement", d.getDecorDisplacement());
			o.addProperty("anim", d.getAnimationID());
			if (d.getAnimationID() != -1)
			{
				sequenceIds.add(d.getAnimationID());
			}
			recolors(o, d.getRecolorToFind(), d.getRecolorToReplace(), d.getRetextureToFind(), d.getTextureToReplace());
			objectJson.add(String.valueOf(d.getId()), o);
		}
		bundle.add("objects", objectJson);

		JsonObject itemJson = new JsonObject();
		for (ItemDefinition d : items.values())
		{
			JsonObject o = new JsonObject();
			o.addProperty("name", d.name);
			o.addProperty("category", d.category);
			o.add("male", intArray(new int[]{d.maleModel0, d.maleModel1, d.maleModel2}));
			o.add("female", intArray(new int[]{d.femaleModel0, d.femaleModel1, d.femaleModel2}));
			o.addProperty("maleOffset", d.maleOffset);
			o.addProperty("femaleOffset", d.femaleOffset);
			// On the ground an item is its inventory model, resized
			o.addProperty("ground", d.inventoryModel);
			o.add("resize", intArray(new int[]{d.resizeX, d.resizeY, d.resizeZ}));
			addModels(new int[]{d.inventoryModel});
			if (d.countObj != null && d.countCo != null)
			{
				o.add("countObj", intArray(d.countObj));
				o.add("countCo", intArray(d.countCo));
			}
			addModels(new int[]{d.maleModel0, d.maleModel1, d.maleModel2, d.femaleModel0, d.femaleModel1, d.femaleModel2});
			recolors(o, d.colorFind, d.colorReplace, d.textureFind, d.textureReplace);
			itemJson.add(String.valueOf(d.id), o);
		}
		bundle.add("items", itemJson);

		JsonObject kitJson = new JsonObject();
		for (KitDefinition d : kits.values())
		{
			JsonObject o = new JsonObject();
			o.addProperty("part", d.bodyPartId);
			o.add("models", intArray(d.models));
			addModels(d.models);
			recolors(o, d.recolorToFind, d.recolorToReplace, d.retextureToFind, d.retextureToReplace);
			kitJson.add(String.valueOf(d.getId()), o);
		}
		bundle.add("kits", kitJson);

		JsonObject spotJson = new JsonObject();
		for (SpotAnimDefinition d : spots.values())
		{
			JsonObject o = new JsonObject();
			o.addProperty("model", d.modelId);
			addModels(new int[]{d.modelId});
			o.addProperty("anim", d.animationId);
			sequenceIds.add(d.animationId);
			o.addProperty("resizeX", d.resizeX);
			o.addProperty("resizeY", d.resizeY);
			o.addProperty("rotation", d.rotaton);
			recolors(o, d.recolorToFind, d.recolorToReplace, d.textureToFind, d.textureToReplace);
			spotJson.add(String.valueOf(d.id), o);
		}
		bundle.add("spotanims", spotJson);

		writeAnimations(bundle);
		writeModels(bundle);
		writeTerrain(bundle);
		writeTextures(bundle);
		writeSprites(bundle);
		writeInterface(bundle);

		out.getParentFile().mkdirs();
		try (Writer w = Files.newBufferedWriter(out.toPath(), StandardCharsets.UTF_8))
		{
			gson.toJson(bundle, w);
		}
		System.out.printf("Wrote %s (%,d KB)%n", out, out.length() / 1024);
	}

	private void writeAnimations(JsonObject bundle) throws IOException
	{
		SequenceLoader loader = new SequenceLoader().configureForRevision(configRevision(ConfigType.SEQUENCE));
		sequenceIds.remove(-1);
		Map<Integer, SequenceDefinition> sequences = loadConfig(ConfigType.SEQUENCE, sequenceIds, loader::load);
		JsonObject seqJson = new JsonObject();
		Map<Integer, Set<Integer>> framesByArchive = new HashMap<>();
		int skeletal = 0;
		for (SequenceDefinition s : sequences.values())
		{
			JsonObject o = new JsonObject();
			if (s.animMayaID != -1)
			{
				// Newer skeletal animations: the replay decodes these itself from the raw files below
				JsonObject sk = new JsonObject();
				sk.addProperty("id", s.animMayaID);
				sk.addProperty("start", s.animMayaStart);
				sk.addProperty("end", s.animMayaEnd);
				o.add("skeletal", sk);
				skeletalIds.add(s.animMayaID);
				skeletal++;
			}
			else if (s.frameIDs != null)
			{
				o.add("frames", intArray(s.frameIDs));
				o.add("lengths", intArray(s.frameLengths));
				for (int f : s.frameIDs)
				{
					framesByArchive.computeIfAbsent(f >>> 16, k -> new TreeSet<>()).add(f & 0xFFFF);
				}
			}
			o.addProperty("frameStep", s.frameStep);
			o.addProperty("loops", s.maxLoops);
			seqJson.add(String.valueOf(s.getId()), o);
		}
		bundle.add("sequences", seqJson);

		JsonObject frameJson = new JsonObject();
		JsonObject framemapJson = new JsonObject();
		Map<Integer, FramemapDefinition> framemaps = new HashMap<>();
		for (Map.Entry<Integer, Set<Integer>> entry : framesByArchive.entrySet())
		{
			Archive archive = store.getIndex(IndexType.ANIMATIONS).getArchive(entry.getKey());
			if (archive == null)
			{
				continue;
			}
			ArchiveFiles files = archive.getFiles(storage.loadArchive(archive));
			for (FSFile file : files.getFiles())
			{
				if (!entry.getValue().contains(file.getFileId()))
				{
					continue;
				}
				byte[] contents = file.getContents();
				int framemapId = ((contents[0] & 0xFF) << 8) | (contents[1] & 0xFF);
				FramemapDefinition framemap = framemaps.get(framemapId);
				if (framemap == null)
				{
					byte[] data = group(IndexType.SKELETONS, framemapId);
					if (data == null)
					{
						continue;
					}
					framemap = new FramemapLoader().load(framemapId, data);
					framemaps.put(framemapId, framemap);
					JsonObject fm = new JsonObject();
					fm.add("types", intArray(framemap.types));
					JsonArray maps = new JsonArray();
					for (int[] m : framemap.frameMaps)
					{
						maps.add(intArray(m));
					}
					fm.add("maps", maps);
					framemapJson.add(String.valueOf(framemapId), fm);
				}
				FrameDefinition frame = new FrameLoader().load(framemap, file.getFileId(), contents);
				JsonObject f = new JsonObject();
				f.addProperty("framemap", framemapId);
				f.add("index", intArray(java.util.Arrays.copyOf(frame.indexFrameIds, frame.translatorCount)));
				f.add("x", intArray(java.util.Arrays.copyOf(frame.translator_x, frame.translatorCount)));
				f.add("y", intArray(java.util.Arrays.copyOf(frame.translator_y, frame.translatorCount)));
				f.add("z", intArray(java.util.Arrays.copyOf(frame.translator_z, frame.translatorCount)));
				frameJson.add(String.valueOf((entry.getKey() << 16) | file.getFileId()), f);
			}
		}
		bundle.add("frames", frameJson);
		bundle.add("framemaps", framemapJson);
		writeSkeletal(bundle);
		System.out.printf("%d animations (%d skeletal), %d frames, %d frame maps%n",
			sequences.size(), skeletal, frameJson.size(), framemapJson.size());
	}

	/**
	 * Skeletal animations and the skeletons they move, as the raw cache files: RuneLite's cache library
	 * doesn't decode them, so the replay does. Each animation names its skeleton in its first bytes
	 */
	private void writeSkeletal(JsonObject bundle) throws IOException
	{
		JsonObject animations = new JsonObject();
		JsonObject skeletons = new JsonObject();
		Map<Integer, ArchiveFiles> archives = new HashMap<>();
		for (int id : skeletalIds)
		{
			int archiveId = id >>> 16;
			ArchiveFiles files = archives.get(archiveId);
			if (files == null && !archives.containsKey(archiveId))
			{
				Archive archive = store.getIndex(IndexType.ANIMAYAS).getArchive(archiveId);
				files = archive == null ? null : archive.getFiles(storage.loadArchive(archive));
				archives.put(archiveId, files);
			}
			FSFile file = files == null ? null : files.findFile(id & 0xFFFF);
			if (file == null)
			{
				continue;
			}
			byte[] data = file.getContents();
			animations.addProperty(String.valueOf(id), b64(data));
			int baseId = ((data[1] & 0xFF) << 8) | (data[2] & 0xFF);
			if (!skeletons.has(String.valueOf(baseId)))
			{
				byte[] base = group(IndexType.SKELETONS, baseId);
				if (base != null)
				{
					skeletons.addProperty(String.valueOf(baseId), b64(base));
				}
			}
		}
		bundle.add("skeletalAnimations", animations);
		bundle.add("skeletons", skeletons);
		System.out.printf("%d of %d skeletal animations found, %d skeletons%n", animations.size(), skeletalIds.size(), skeletons.size());
	}

	private void writeModels(JsonObject bundle) throws IOException
	{
		modelIds.remove(-1);
		JsonObject models = new JsonObject();
		ModelLoader loader = new ModelLoader();
		int missing = 0;
		for (int id : modelIds)
		{
			byte[] data = group(IndexType.MODELS, id);
			if (data == null)
			{
				missing++;
				continue;
			}
			ModelDefinition m = loader.load(id, data);
			JsonObject o = new JsonObject();
			int[] vertices = new int[m.vertexCount * 3];
			for (int i = 0; i < m.vertexCount; i++)
			{
				vertices[i * 3] = m.vertexX[i];
				vertices[i * 3 + 1] = m.vertexY[i];
				vertices[i * 3 + 2] = m.vertexZ[i];
			}
			o.addProperty("v", b64(vertices));
			int[] faces = new int[m.faceCount * 3];
			for (int i = 0; i < m.faceCount; i++)
			{
				faces[i * 3] = m.faceIndices1[i];
				faces[i * 3 + 1] = m.faceIndices2[i];
				faces[i * 3 + 2] = m.faceIndices3[i];
			}
			o.addProperty("f", b64(faces));
			o.addProperty("c", b64(m.faceColors));
			if (m.faceTransparencies != null)
			{
				o.addProperty("a", b64(m.faceTransparencies));
			}
			if (m.faceRenderTypes != null)
			{
				o.addProperty("rt", b64(m.faceRenderTypes));
			}
			if (m.faceTextures != null && m.faceTextureUCoordinates != null && m.faceTextureVCoordinates != null)
			{
				// Texture coordinates per face corner, as the client maps them: u0 v0 u1 v1 u2 v2
				ByteBuffer uv = ByteBuffer.allocate(m.faceCount * 24).order(ByteOrder.LITTLE_ENDIAN);
				for (int i = 0; i < m.faceCount; i++)
				{
					float[] u = m.faceTextureUCoordinates[i];
					float[] v = m.faceTextureVCoordinates[i];
					for (int k = 0; k < 3; k++)
					{
						uv.putFloat(u == null ? 0 : u[k]);
						uv.putFloat(v == null ? 0 : v[k]);
					}
				}
				o.addProperty("uv", Base64.getEncoder().encodeToString(uv.array()));
			}
			if (m.faceTextures != null)
			{
				o.addProperty("t", b64(m.faceTextures));
				for (short t : m.faceTextures)
				{
					if (t >= 0)
					{
						textureIds.add((int) t);
					}
				}
			}
			int[] vertexLabels = vertexLabels(m);
			if (vertexLabels != null)
			{
				o.addProperty("vg", b64(vertexLabels));
			}
			if (m.packedTransparencyVertexGroups != null)
			{
				o.addProperty("tg", b64(m.packedTransparencyVertexGroups));
			}
			if (m.animayaGroups != null && m.animayaScales != null)
			{
				// Bone weights for skeletal animation, per vertex: a count, then that many bones (or weights)
				o.addProperty("mg", b64(flatten(m.animayaGroups)));
				o.addProperty("ms", b64(flatten(m.animayaScales)));
			}
			models.add(String.valueOf(id), o);
		}
		bundle.add("models", models);
		System.out.printf("%d models%s%n", models.size(), missing > 0 ? " (" + missing + " missing from this cache)" : "");
	}

	/**
	 * Ground colours for instance map loads, worked out from the map squares each instance chunk was
	 * copied from. Each scene tile gets its underlay colour and its overlay colour, shape and rotation
	 */
	private void writeTerrain(JsonObject bundle) throws IOException
	{
		UnderlayLoader underlayLoader = new UnderlayLoader();
		Map<Integer, UnderlayDefinition> underlays = loadConfig(ConfigType.UNDERLAY, null, underlayLoader::load);
		OverlayLoader overlayLoader = new OverlayLoader();
		Map<Integer, OverlayDefinition> overlays = loadConfig(ConfigType.OVERLAY, null, overlayLoader::load);
		Map<Integer, MapDefinition> maps = new HashMap<>();
		JsonArray terrain = new JsonArray();
		for (JsonObject scene : scenes)
		{
			JsonObject t = new JsonObject();
			t.addProperty("t", integer(scene, "t", 0));
			if (!scene.has("templates") || !scene.get("instance").getAsBoolean())
			{
				JsonObject open = openWorld.get(integer(scene, "t", 0));
				if (open != null)
				{
					terrainPlanes(t, open, underlays, overlays);
				}
				terrain.add(t);
				continue;
			}
			JsonArray templates = scene.getAsJsonArray("templates");
			JsonArray planes = new JsonArray();
			for (int plane = 0; plane < templates.size(); plane++)
			{
				int[] under = new int[104 * 104];
				int[] over = new int[104 * 104];
				byte[] shape = new byte[104 * 104];
				java.util.Arrays.fill(under, -1);
				java.util.Arrays.fill(over, -1);
				JsonArray chunks = templates.get(plane).getAsJsonArray();
				for (int cx = 0; cx < chunks.size(); cx++)
				{
					JsonArray column = chunks.get(cx).getAsJsonArray();
					for (int cy = 0; cy < column.size(); cy++)
					{
						int packed = column.get(cy).getAsInt();
						if (packed == -1)
						{
							continue;
						}
						int rotation = (packed >> 1) & 3;
						int srcY = ((packed >> 3) & 0x7FF) * 8;
						int srcX = ((packed >> 14) & 0x3FF) * 8;
						int srcPlane = (packed >> 24) & 3;
						int regionId = ((srcX >> 6) << 8) | (srcY >> 6);
						MapDefinition map = maps.computeIfAbsent(regionId, this::loadMap);
						if (map == null)
						{
							continue;
						}
						for (int lx = 0; lx < 8; lx++)
						{
							for (int ly = 0; ly < 8; ly++)
							{
								int sceneX = cx * 8 + lx;
								int sceneY = cy * 8 + ly;
								if (sceneX >= 104 || sceneY >= 104)
								{
									continue;
								}
								// Undo the chunk's rotation to find the tile it was copied from
								int[] src = unrotate(lx, ly, rotation);
								MapDefinition.Tile tile = map.getTiles()[srcPlane][(srcX & 63) + src[0]][(srcY & 63) + src[1]];
								int i = sceneX * 104 + sceneY;
								if (tile.underlayId > 0)
								{
									UnderlayDefinition u = underlays.get(tile.underlayId - 1);
									under[i] = u == null ? -1 : u.getColor();
								}
								if (tile.overlayId > 0)
								{
									OverlayDefinition o = overlays.get(tile.overlayId - 1);
									if (o != null && o.getTexture() >= 0)
									{
										textureIds.add(o.getTexture());
										// Negative marks a texture: decoded with the texture colours
										over[i] = -2 - o.getTexture();
									}
									else if (o != null && o.getRgbColor() != 0xFF00FF)
									{
										over[i] = o.getRgbColor();
									}
									shape[i] = (byte) ((tile.overlayPath << 2) | ((tile.overlayRotation + rotation) & 3));
								}
							}
						}
					}
				}
				JsonObject p = new JsonObject();
				p.addProperty("under", b64(under));
				p.addProperty("over", b64(over));
				p.addProperty("shape", b64(shape));
				planes.add(p);
			}
			t.add("planes", planes);
			terrain.add(t);
		}
		bundle.add("terrain", terrain);
	}

	/** Map loads outside instances, by tick: their scene's regions, read from the cache */
	private final Map<Integer, JsonObject> openWorld = new HashMap<>();
	private final Map<Integer, Region> regions = new HashMap<>();

	/**
	 * For each open-world map load, the 104 x 104 scene's tiles, heights and objects from the cache's map
	 * squares: the recorder leaves these out there, since the cache has them
	 */
	private void prepareOpenWorld()
	{
		for (JsonObject scene : scenes)
		{
			if (scene.has("instance") && scene.get("instance").getAsBoolean())
			{
				continue;
			}
			int baseX = integer(scene, "baseX", 0);
			int baseY = integer(scene, "baseY", 0);
			JsonObject o = new JsonObject();
			o.addProperty("baseX", baseX);
			o.addProperty("baseY", baseY);
			List<int[]> objects = new ArrayList<>();
			Set<Integer> seen = new java.util.HashSet<>();
			for (int sx = 0; sx < 104; sx += 64 - ((baseX + sx) & 63))
			{
				for (int sy = 0; sy < 104; sy += 64 - ((baseY + sy) & 63))
				{
					int regionId = (((baseX + sx) >> 6) << 8) | ((baseY + sy) >> 6);
					if (!seen.add(regionId))
					{
						continue;
					}
					Region region = region(regionId);
					if (region == null)
					{
						continue;
					}
					for (net.runelite.cache.region.Location loc : region.getLocations())
					{
						net.runelite.cache.region.Position p = loc.getPosition();
						// Positions are world coordinates once the region has loaded them
						int wx = p.getX() < 64 ? region.getBaseX() + p.getX() : p.getX();
						int wy = p.getY() < 64 ? region.getBaseY() + p.getY() : p.getY();
						int lx = wx - baseX;
						int ly = wy - baseY;
						if (lx < 0 || ly < 0 || lx >= 104 || ly >= 104)
						{
							continue;
						}
						int plane = p.getZ();
						// Bridges: everything on a bridge tile moves down a floor, and what was on the ground
						// floor goes underneath (floor -1)
						if ((region.getTileSetting(1, wx & 63, wy & 63) & 2) != 0)
						{
							plane--;
						}
						objects.add(new int[]{loc.getId(), lx, ly, plane, loc.getType(), loc.getOrientation()});
						objectIds.add(loc.getId());
					}
				}
			}
			int[] flat = new int[objects.size() * 6];
			for (int i = 0; i < objects.size(); i++)
			{
				System.arraycopy(objects.get(i), 0, flat, i * 6, 6);
			}
			o.addProperty("objects", b64(flat));
			openWorld.put(integer(scene, "t", 0), o);
		}
	}

	/** A region's terrain and objects, loaded once */
	private Region region(int regionId)
	{
		return regions.computeIfAbsent(regionId, id -> {
			int rx = id >> 8;
			int ry = id & 0xFF;
			try
			{
				Archive archive = store.getIndex(IndexType.MAPS).getArchive(id);
				if (archive == null || archive.getFileData().length < 2)
				{
					return null;
				}
				ArchiveFiles files = archive.getFiles(storage.loadArchive(archive));
				FSFile terrain = files.findFile(0);
				FSFile locations = files.findFile(1);
				if (terrain == null)
				{
					return null;
				}
				Region region = new Region(rx, ry);
				region.loadTerrain(new MapLoader().load(rx, ry, terrain.getContents()));
				if (locations != null)
				{
					region.loadLocations(new net.runelite.cache.definitions.loaders.LocationsLoader().load(rx, ry, locations.getContents()));
				}
				return region;
			}
			catch (IOException e)
			{
				return null;
			}
		});
	}

	/** Ground colours, overlay shapes and tile heights for an open-world scene, floor by floor */
	private void terrainPlanes(JsonObject t, JsonObject open, Map<Integer, UnderlayDefinition> underlays, Map<Integer, OverlayDefinition> overlays)
	{
		int baseX = open.get("baseX").getAsInt();
		int baseY = open.get("baseY").getAsInt();
		JsonArray planes = new JsonArray();
		JsonArray heights = new JsonArray();
		// Floor -1: what's under bridges, drawn below the deck; then floors 0-3
		for (int plane = -1; plane < 4; plane++)
		{
			int[] under = new int[104 * 104];
			int[] over = new int[104 * 104];
			byte[] shape = new byte[104 * 104];
			int[] height = new int[104 * 104];
			java.util.Arrays.fill(under, -1);
			java.util.Arrays.fill(over, -1);
			for (int sx = 0; sx < 104; sx++)
			{
				for (int sy = 0; sy < 104; sy++)
				{
					int wx = baseX + sx;
					int wy = baseY + sy;
					Region region = region(((wx >> 6) << 8) | (wy >> 6));
					if (region == null)
					{
						continue;
					}
					int i = sx * 104 + sy;
					int x = wx & 63;
					int y = wy & 63;
					// A bridge tile shows the floor above it: the deck on the ground floor, and so on up
					boolean bridge = (region.getTileSetting(1, x, y) & 2) != 0;
					int src = bridge ? plane + 1 : plane;
					if (src > 3 || src < 0 || (plane == -1 && !bridge))
					{
						height[i] = plane == -1 ? region.getTileHeight(0, x, y) : height[i];
						continue;
					}
					height[i] = region.getTileHeight(src, x, y);
					int underlay = region.getUnderlayId(src, x, y);
					if (underlay > 0)
					{
						UnderlayDefinition u = underlays.get(underlay - 1);
						under[i] = u == null ? -1 : u.getColor();
					}
					int overlay = region.getOverlayId(src, x, y);
					if (overlay > 0)
					{
						OverlayDefinition o = overlays.get(overlay - 1);
						if (o != null && o.getTexture() >= 0)
						{
							textureIds.add(o.getTexture());
							over[i] = -2 - o.getTexture();
						}
						else if (o != null && o.getRgbColor() != 0xFF00FF)
						{
							over[i] = o.getRgbColor();
						}
						shape[i] = (byte) ((region.getOverlayPath(src, x, y) << 2) | (region.getOverlayRotation(src, x, y) & 3));
					}
				}
			}
			JsonObject p = new JsonObject();
			p.addProperty("under", b64(under));
			p.addProperty("over", b64(over));
			p.addProperty("shape", b64(shape));
			if (plane == -1)
			{
				t.add("below", p);
				t.addProperty("belowHeights", b64(height));
				continue;
			}
			planes.add(p);
			heights.add(b64(height));
		}
		t.add("planes", planes);
		t.add("heights", heights);
		t.addProperty("objects", open.get("objects").getAsString());
	}

	private MapDefinition loadMap(int regionId)
	{
		int rx = regionId >> 8;
		int ry = regionId & 0xFF;
		try
		{
			Index maps = store.getIndex(IndexType.MAPS);
			// Current caches keep each map square in archive (x << 8 | y), terrain as its file 0; older ones
			// named a terrain archive "m<x>_<y>"
			Archive archive = maps.getArchive(regionId);
			byte[] data;
			if (archive != null && archive.getFileData().length > 1)
			{
				FSFile terrain = archive.getFiles(storage.loadArchive(archive)).findFile(0);
				data = terrain == null ? null : terrain.getContents();
			}
			else
			{
				archive = maps.findArchiveByName("m" + rx + "_" + ry);
				data = archive == null ? null : archive.decompress(storage.loadArchive(archive));
			}
			return data == null ? null : new MapLoader().load(rx, ry, data);
		}
		catch (IOException e)
		{
			return null;
		}
	}

	/** Chunk rotation, as the client's instance code applies it, undone */
	static int[] unrotate(int x, int y, int rotation)
	{
		switch ((4 - rotation) & 3)
		{
			case 1:
				return new int[]{y, 7 - x};
			case 2:
				return new int[]{7 - x, 7 - y};
			case 3:
				return new int[]{7 - y, x};
			default:
				return new int[]{x, y};
		}
	}

	/** Each texture's average colour, which is what textured faces look like at a distance */
	private void writeTextures(JsonObject bundle) throws IOException
	{
		Index index = store.getIndex(IndexType.TEXTURES);
		Archive archive = index.getArchive(0);
		ArchiveFiles files = archive.getFiles(storage.loadArchive(archive));
		JsonObject textures = new JsonObject();
		JsonObject images = new JsonObject();
		TextureLoader loader = new TextureLoader();
		for (FSFile file : files.getFiles())
		{
			if (!textureIds.contains(file.getFileId()))
			{
				continue;
			}
			TextureDefinition t = loader.load(file.getFileId(), file.getContents());
			int rgb = averageSpriteColor(t.getFileIds());
			textures.addProperty(String.valueOf(file.getFileId()), rgb);
			JsonObject image = textureImage(t);
			if (image != null)
			{
				images.add(String.valueOf(file.getFileId()), image);
			}
		}
		bundle.add("textures", textures);
		bundle.add("textureImages", images);
	}

	/**
	 * The side panel's sprites, and an icon for every item you held, drawn by the client's own item
	 * icon renderer (models posed and lit as the game draws them, with the outline and shadow)
	 */
	private void writeInterface(JsonObject bundle) throws IOException
	{
		JsonObject ui = new JsonObject();
		Set<Integer> spriteIds = new TreeSet<>(widgetSprites);
		for (int id : UI_SPRITES)
		{
			spriteIds.add(id);
		}
		Map<Integer, ItemDefinition> allItems = loadConfig(ConfigType.ITEM, null, new ItemLoader()::load);
		writeSpells(bundle, allItems, spriteIds);
		writeCombatStyles(bundle, spriteIds);
		for (int id : spriteIds)
		{
			String png = spritePng(id, 0);
			if (png != null)
			{
				ui.addProperty(String.valueOf(id), png);
			}
		}
		bundle.add("uiSprites", ui);

		ModelLoader modelLoader = new ModelLoader();
		Map<Integer, TextureDefinition> textureDefs = new HashMap<>();
		Archive textureArchive = store.getIndex(IndexType.TEXTURES).getArchive(0);
		TextureLoader textureLoader = new TextureLoader();
		for (FSFile file : textureArchive.getFiles(storage.loadArchive(textureArchive)).getFiles())
		{
			textureDefs.put(file.getFileId(), textureLoader.load(file.getFileId(), file.getContents()));
		}
		// The renderer finds textures by their own IDs and can't take gaps in the list
		TextureDefinition[] textureArray = textureDefs.values().toArray(new TextureDefinition[0]);

		JsonObject icons = new JsonObject();
		int failed = 0;
		for (Map.Entry<Integer, Set<Integer>> held : heldItems.entrySet())
		{
			ItemDefinition def = allItems.get(held.getKey());
			// Most items look the same at any stack size: only those with stack variants need each size
			Set<Integer> sizes = def != null && def.countObj != null ? held.getValue() : java.util.Set.of(1);
			for (int quantity : sizes)
			{
				try
				{
					java.awt.image.BufferedImage image = net.runelite.cache.item.ItemSpriteFactory.createSprite(
						allItems::get,
						id -> {
							byte[] data = group(IndexType.MODELS, id);
							return data == null ? null : modelLoader.load(id, data);
						},
						(id, frame) -> {
							try
							{
								byte[] data = group(IndexType.SPRITES, id);
								return data == null ? null : new SpriteLoader().load(id, data)[frame];
							}
							catch (IOException e)
							{
								return null;
							}
						},
						() -> textureArray,
						held.getKey(), quantity, 1, 0x302020, false);
					java.io.ByteArrayOutputStream png = new java.io.ByteArrayOutputStream();
					javax.imageio.ImageIO.write(image, "png", png);
					String key = def != null && def.countObj != null ? held.getKey() + ":" + quantity : String.valueOf(held.getKey());
					icons.addProperty(key, "data:image/png;base64," + Base64.getEncoder().encodeToString(png.toByteArray()));
				}
				catch (Exception e)
				{
					if (failed++ == 0)
					{
						System.err.println("Item icon " + held.getKey() + " failed:");
						e.printStackTrace();
					}
				}
			}
		}
		bundle.add("itemIcons", icons);
		System.out.printf("%d interface sprites, %d item icons%s%n", ui.size(), icons.size(), failed > 0 ? " (" + failed + " failed)" : "");
	}

	/**
	 * Every spell, from the items the game defines them as: name (param 601), level (604), spellbook
	 * (336), its button in the spellbook interface (596), lit and dim icons (597, 598) and runes
	 * (365-370 as item and amount pairs). Older recordings, which don't record the spellbook itself,
	 * draw it from these
	 */
	private void writeSpells(JsonObject bundle, Map<Integer, ItemDefinition> items, Set<Integer> spriteIds)
	{
		JsonArray spells = new JsonArray();
		for (ItemDefinition d : items.values())
		{
			Map<Integer, Object> p = d.params;
			if (p == null || !(p.get(601) instanceof String) || !(p.get(596) instanceof Integer) || ((Integer) p.get(596) >>> 16) != 218)
			{
				continue;
			}
			JsonObject s = new JsonObject();
			s.addProperty("name", (String) p.get(601));
			s.addProperty("level", p.get(604) instanceof Integer ? (Integer) p.get(604) : 1);
			s.addProperty("book", p.get(336) instanceof Integer ? (Integer) p.get(336) : 0);
			s.addProperty("slot", (Integer) p.get(596) & 0xFFFF);
			int on = p.get(597) instanceof Integer ? (Integer) p.get(597) : -1;
			int off = p.get(598) instanceof Integer ? (Integer) p.get(598) : -1;
			s.addProperty("on", on);
			s.addProperty("off", off);
			if (on > 0)
			{
				spriteIds.add(on);
			}
			if (off > 0)
			{
				spriteIds.add(off);
			}
			JsonArray runes = new JsonArray();
			for (int k = 365; k <= 369; k += 2)
			{
				if (p.get(k) instanceof Integer && p.get(k + 1) instanceof Integer)
				{
					JsonArray r = new JsonArray();
					r.add((Integer) p.get(k));
					r.add((Integer) p.get(k + 1));
					runes.add(r);
				}
			}
			s.add("runes", runes);
			spells.add(s);
		}
		bundle.add("spells", spells);
	}

	/**
	 * The combat tab's buttons for each weapon type (the game's varbit 357), from the cache's combat
	 * styles table (78): per style its slot, button name, tooltip and icon sprite
	 */
	private void writeCombatStyles(JsonObject bundle, Set<Integer> spriteIds) throws IOException
	{
		JsonObject styles = new JsonObject();
		Archive ar = store.getIndex(IndexType.CONFIGS).getArchive(ConfigType.DBROW.getId());
		for (FSFile f : ar.getFiles(storage.loadArchive(ar)).getFiles())
		{
			net.runelite.cache.definitions.DBRowDefinition row = new net.runelite.cache.definitions.loaders.DBRowLoader().load(f.getFileId(), f.getContents());
			Object[][] cols = row.getColumnValues();
			if (row.getTableId() != 78 || cols == null || cols.length < 2 || cols[0] == null || cols[1] == null)
			{
				continue;
			}
			JsonArray list = new JsonArray();
			for (int i = 0; i + 3 < cols[1].length; i += 4)
			{
				JsonArray s = new JsonArray();
				s.add((Integer) cols[1][i]);
				s.add(String.valueOf(cols[1][i + 1]));
				s.add(String.valueOf(cols[1][i + 2]).replace("<br>", "\n"));
				s.add((Integer) cols[1][i + 3]);
				spriteIds.add((Integer) cols[1][i + 3]);
				list.add(s);
			}
			styles.add(String.valueOf(cols[0][0]), list);
		}
		bundle.add("combatStyles", styles);
	}

	private String spritePng(int group, int frame) throws IOException
	{
		byte[] data = group(IndexType.SPRITES, group);
		if (data == null)
		{
			return null;
		}
		SpriteDefinition[] frames = new SpriteLoader().load(group, data);
		if (frame >= frames.length)
		{
			return null;
		}
		SpriteDefinition sprite = frames[frame];
		int w = sprite.getWidth();
		int h = sprite.getHeight();
		if (w <= 0 || h <= 0)
		{
			return null;
		}
		// Drawn at the sprite's full size with its offset, so pieces line up as the client places them
		int fullW = Math.max(w + sprite.getOffsetX(), sprite.getMaxWidth());
		int fullH = Math.max(h + sprite.getOffsetY(), sprite.getMaxHeight());
		java.awt.image.BufferedImage image = new java.awt.image.BufferedImage(fullW, fullH, java.awt.image.BufferedImage.TYPE_INT_ARGB);
		int[] pixels = sprite.getPixels();
		for (int i = 0; i < pixels.length; i++)
		{
			int px = pixels[i] & 0xFFFFFF;
			image.setRGB(sprite.getOffsetX() + i % w, sprite.getOffsetY() + i / w, px == 0 ? 0 : 0xFF000000 | px);
		}
		java.io.ByteArrayOutputStream png = new java.io.ByteArrayOutputStream();
		javax.imageio.ImageIO.write(image, "png", png);
		return "data:image/png;base64," + Base64.getEncoder().encodeToString(png.toByteArray());
	}

	/** Overhead icon sprites as PNG data URLs, one list of frames per sprite group */
	private void writeSprites(JsonObject bundle) throws IOException
	{
		JsonObject sprites = new JsonObject();
		for (int group : spriteGroups)
		{
			byte[] data = group(IndexType.SPRITES, group);
			if (data == null)
			{
				continue;
			}
			JsonArray frames = new JsonArray();
			for (SpriteDefinition sprite : new SpriteLoader().load(group, data))
			{
				int w = sprite.getWidth();
				int h = sprite.getHeight();
				if (w <= 0 || h <= 0)
				{
					frames.add("");
					continue;
				}
				java.awt.image.BufferedImage image = new java.awt.image.BufferedImage(w, h, java.awt.image.BufferedImage.TYPE_INT_ARGB);
				int[] pixels = sprite.getPixels();
				for (int i = 0; i < pixels.length; i++)
				{
					// Black is the transparent colour in sprites
					int px = pixels[i] & 0xFFFFFF;
					image.setRGB(i % w, i / w, px == 0 ? 0 : 0xFF000000 | px);
				}
				java.io.ByteArrayOutputStream png = new java.io.ByteArrayOutputStream();
				javax.imageio.ImageIO.write(image, "png", png);
				frames.add("data:image/png;base64," + Base64.getEncoder().encodeToString(png.toByteArray()));
			}
			sprites.add(String.valueOf(group), frames);
		}
		bundle.add("sprites", sprites);
	}

	/**
	 * A texture's picture as a PNG, from its first sprite, with how it scrolls if it's animated. Black
	 * pixels are transparent, as the client treats them in textures
	 */
	private JsonObject textureImage(TextureDefinition t) throws IOException
	{
		int[] spriteIds = t.getFileIds();
		if (spriteIds == null || spriteIds.length == 0)
		{
			return null;
		}
		byte[] data = group(IndexType.SPRITES, spriteIds[0]);
		if (data == null)
		{
			return null;
		}
		SpriteDefinition sprite = new SpriteLoader().load(spriteIds[0], data)[0];
		int w = sprite.getWidth();
		int h = sprite.getHeight();
		if (w <= 0 || h <= 0)
		{
			return null;
		}
		java.awt.image.BufferedImage image = new java.awt.image.BufferedImage(w, h, java.awt.image.BufferedImage.TYPE_INT_ARGB);
		int[] pixels = sprite.getPixels();
		for (int i = 0; i < pixels.length; i++)
		{
			int px = pixels[i] & 0xFFFFFF;
			image.setRGB(i % w, i / w, px == 0 ? 0 : 0xFF000000 | px);
		}
		java.io.ByteArrayOutputStream png = new java.io.ByteArrayOutputStream();
		javax.imageio.ImageIO.write(image, "png", png);
		JsonObject o = new JsonObject();
		o.addProperty("png", "data:image/png;base64," + Base64.getEncoder().encodeToString(png.toByteArray()));
		o.addProperty("direction", t.getAnimationDirection());
		o.addProperty("speed", t.getAnimationSpeed());
		o.addProperty("sprites", spriteIds.length);
		return o;
	}

	private int averageSpriteColor(int[] spriteIds) throws IOException
	{
		long r = 0;
		long g = 0;
		long b = 0;
		long n = 0;
		for (int id : spriteIds == null ? new int[0] : spriteIds)
		{
			byte[] data = group(IndexType.SPRITES, id);
			if (data == null)
			{
				continue;
			}
			for (SpriteDefinition sprite : new SpriteLoader().load(id, data))
			{
				for (int px : sprite.getPixels())
				{
					if ((px & 0xFFFFFF) != 0)
					{
						r += (px >> 16) & 0xFF;
						g += (px >> 8) & 0xFF;
						b += px & 0xFF;
						n++;
					}
				}
			}
		}
		return n == 0 ? 0x808080 : (int) ((r / n) << 16 | (g / n) << 8 | (b / n));
	}

	// ---------- helpers ----------

	private void addModels(int[] ids)
	{
		if (ids != null)
		{
			for (int id : ids)
			{
				modelIds.add(id);
			}
		}
	}

	private static void recolors(JsonObject o, short[] find, short[] replace, short[] tfind, short[] treplace)
	{
		if (find != null && replace != null)
		{
			o.add("recolorFind", shortArray(find));
			o.add("recolorReplace", shortArray(replace));
		}
		if (tfind != null && treplace != null)
		{
			o.add("retextureFind", shortArray(tfind));
			o.add("retextureReplace", shortArray(treplace));
		}
	}

	private static JsonArray intArray(int[] values)
	{
		JsonArray a = new JsonArray();
		if (values != null)
		{
			for (int v : values)
			{
				a.add(v);
			}
		}
		return a;
	}

	private static JsonArray shortArray(short[] values)
	{
		JsonArray a = new JsonArray();
		for (short v : values)
		{
			a.add(v);
		}
		return a;
	}

	/**
	 * Each vertex's bone label for classic animations, or -1. The loader turns the labels into lists of
	 * vertices per label and then drops the per-vertex array, so it's rebuilt here from the lists
	 */
	private static int[] vertexLabels(ModelDefinition m)
	{
		int[][] groups = m.getVertexGroups();
		if (groups == null)
		{
			return m.packedVertexGroups;
		}
		int[] labels = new int[m.vertexCount];
		java.util.Arrays.fill(labels, -1);
		for (int label = 0; label < groups.length; label++)
		{
			if (groups[label] != null)
			{
				for (int v : groups[label])
				{
					labels[v] = label;
				}
			}
		}
		return labels;
	}

	private static int[] flatten(int[][] perVertex)
	{
		int size = 0;
		for (int[] v : perVertex)
		{
			size += 1 + (v == null ? 0 : v.length);
		}
		int[] out = new int[size];
		int at = 0;
		for (int[] v : perVertex)
		{
			out[at++] = v == null ? 0 : v.length;
			if (v != null)
			{
				for (int x : v)
				{
					out[at++] = x;
				}
			}
		}
		return out;
	}

	private static String b64(int[] values)
	{
		ByteBuffer buf = ByteBuffer.allocate(values.length * 4).order(ByteOrder.LITTLE_ENDIAN);
		for (int v : values)
		{
			buf.putInt(v);
		}
		return Base64.getEncoder().encodeToString(buf.array());
	}

	private static String b64(short[] values)
	{
		ByteBuffer buf = ByteBuffer.allocate(values.length * 2).order(ByteOrder.LITTLE_ENDIAN);
		for (short v : values)
		{
			buf.putShort(v);
		}
		return Base64.getEncoder().encodeToString(buf.array());
	}

	private static String b64(byte[] values)
	{
		return Base64.getEncoder().encodeToString(values);
	}

	private static void ints(JsonElement array, Set<Integer> into)
	{
		if (array != null && array.isJsonArray())
		{
			for (JsonElement e : array.getAsJsonArray())
			{
				into.add(e.getAsInt());
			}
		}
	}

	private static int refId(JsonElement ref)
	{
		if (ref == null || !ref.isJsonObject())
		{
			return -1;
		}
		JsonObject o = ref.getAsJsonObject();
		return "npc".equals(str(o, "k")) && o.has("id") ? o.get("id").getAsInt() : -1;
	}

	private static String str(JsonObject o, String key)
	{
		return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : "";
	}

	private static int integer(JsonObject o, String key, int fallback)
	{
		return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsInt() : fallback;
	}
}
