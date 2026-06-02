import os
from dotenv import load_dotenv
load_dotenv()
from pymongo import MongoClient
from urllib.parse import urlparse

uri = os.environ["MONGODB_URI"]
path = urlparse(uri).path.lstrip("/")
client = MongoClient(uri, serverSelectionTimeoutMS=30000)
db = client[path]

all_names = db["crop_prices"].distinct("item_name")
carrot_names = [n for n in all_names if "arrot" in n]
print("Carrot variants:", carrot_names)

for name in carrot_names:
    count = db["crop_prices"].count_documents({"item_name": name})
    oldest = db["crop_prices"].find_one({"item_name": name}, {"date": 1}, sort=[("date", 1)])
    newest = db["crop_prices"].find_one({"item_name": name}, {"date": 1}, sort=[("date", -1)])
    od = oldest["date"].date() if oldest else "?"
    nd = newest["date"].date() if newest else "?"
    print(name + ": " + str(count) + " rows | " + str(od) + " to " + str(nd))

print("")
count_g = db["crop_prices"].count_documents({"item_name": "Ginger"})
og = db["crop_prices"].find_one({"item_name": "Ginger"}, {"date": 1}, sort=[("date", 1)])
ng = db["crop_prices"].find_one({"item_name": "Ginger"}, {"date": 1}, sort=[("date", -1)])
print("Ginger: " + str(count_g) + " rows | " + str(og["date"].date()) + " to " + str(ng["date"].date()))

print("")
total = db["crop_prices"].count_documents({})
print("Total crop_prices rows: " + str(total))

print("")
print("Top 10 crops by row count:")
pipeline = [
    {"$group": {"_id": "$item_name", "count": {"$sum": 1}}},
    {"$sort": {"count": -1}},
    {"$limit": 10}
]
for doc in db["crop_prices"].aggregate(pipeline):
    print("  " + doc["_id"] + ": " + str(doc["count"]))
