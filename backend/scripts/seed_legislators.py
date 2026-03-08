"""Seed the legislators table with all 120 CA state legislators (2025-2026 session).

Idempotent: upserts on (chamber, district). Can be run as a standalone script
or imported and called from the FastAPI seed endpoint.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select

from app.database import async_session
from app.models.legislator import Legislator

# fmt: off
ASSEMBLY_MEMBERS: list[tuple[int, str, str]] = [
    # (district, name, party)
    (1,  "Heather Hadwick",          "Republican"),
    (2,  "Chris Rogers",             "Democrat"),
    (3,  "James Gallagher",          "Republican"),
    (4,  "Cecilia Aguiar-Curry",     "Democrat"),
    (5,  "Joe Patterson",            "Republican"),
    (6,  "Maggy Krell",              "Democrat"),
    (7,  "Josh Hoover",              "Republican"),
    (8,  "David J. Tangipa",         "Republican"),
    (9,  "Heath Flora",              "Republican"),
    (10, "Stephanie Nguyen",         "Democrat"),
    (11, "Lori D. Wilson",           "Democrat"),
    (12, "Damon Connolly",           "Democrat"),
    (13, "Rhodesia Ransom",          "Democrat"),
    (14, "Buffy Wicks",              "Democrat"),
    (15, "Anamarie Avila Farias",    "Democrat"),
    (16, "Rebecca Bauer-Kahan",      "Democrat"),
    (17, "Matt Haney",               "Democrat"),
    (18, "Mia Bonta",                "Democrat"),
    (19, "Catherine Stefani",        "Democrat"),
    (20, "Liz Ortega",               "Democrat"),
    (21, "Diane Papan",              "Democrat"),
    (22, "Juan Alanis",              "Republican"),
    (23, "Marc Berman",              "Democrat"),
    (24, "Alex Lee",                 "Democrat"),
    (25, "Ash Kalra",                "Democrat"),
    (26, "Patrick J. Ahrens",        "Democrat"),
    (27, "Esmeralda Z. Soria",       "Democrat"),
    (28, "Gail Pellerin",            "Democrat"),
    (29, "Robert Rivas",             "Democrat"),
    (30, "Dawn Addis",               "Democrat"),
    (31, "Dr. Joaquin Arambula",     "Democrat"),
    (32, "Stan Ellis",               "Republican"),
    (33, "Alexandra M. Macedo",      "Republican"),
    (34, "Tom Lackey",               "Republican"),
    (35, "Jasmeet Kaur Bains",       "Democrat"),
    (36, "Jeff Gonzalez",            "Republican"),
    (37, "Gregg Hart",               "Democrat"),
    (38, "Steve Bennett",            "Democrat"),
    (39, "Juan Carrillo",            "Democrat"),
    (40, "Pilar Schiavo",            "Democrat"),
    (41, "John Harabedian",          "Democrat"),
    (42, "Jacqui Irwin",             "Democrat"),
    (43, "Celeste Rodriguez",        "Democrat"),
    (44, "Nick Schultz",             "Democrat"),
    (45, "James C. Ramos",           "Democrat"),
    (46, "Jesse Gabriel",            "Democrat"),
    (47, "Greg Wallis",              "Republican"),
    (48, "Blanca E. Rubio",          "Democrat"),
    (49, "Mike Fong",                "Democrat"),
    (50, "Robert Garcia",            "Democrat"),
    (51, "Rick Chavez Zbur",         "Democrat"),
    (52, "Jessica M. Caloza",        "Democrat"),
    (53, "Michelle Rodriguez",       "Democrat"),
    (54, "Mark Gonzalez",            "Democrat"),
    (55, "Isaac G. Bryan",           "Democrat"),
    (56, "Lisa Calderon",            "Democrat"),
    (57, "Sade Elhawary",            "Democrat"),
    (58, "Leticia Castillo",         "Republican"),
    (59, "Phillip Chen",             "Republican"),
    (60, "Dr. Corey A. Jackson",     "Democrat"),
    (61, "Tina S. McKinnor",         "Democrat"),
    (62, "Jose Luis Solache Jr.",    "Democrat"),
    (63, "Natasha Johnson",          "Republican"),
    (64, "Blanca Pacheco",           "Democrat"),
    (65, "Mike A. Gipson",           "Democrat"),
    (66, "Al Muratsuchi",            "Democrat"),
    (67, "Sharon Quirk-Silva",       "Democrat"),
    (68, "Avelino Valencia",         "Democrat"),
    (69, "Josh Lowenthal",           "Democrat"),
    (70, "Tri Ta",                   "Republican"),
    (71, "Kate Sanchez",             "Republican"),
    (72, "Diane B. Dixon",           "Republican"),
    (73, "Cottie Petrie-Norris",     "Democrat"),
    (74, "Laurie Davies",            "Republican"),
    (75, "Carl DeMaio",              "Republican"),
    (76, "Dr. Darshana R. Patel",    "Democrat"),
    (77, "Tasha Boerner",            "Democrat"),
    (78, "Christopher M. Ward",      "Democrat"),
    (79, "Dr. LaShae Sharp-Collins", "Democrat"),
    (80, "David A. Alvarez",         "Democrat"),
]

SENATE_MEMBERS: list[tuple[int, str, str]] = [
    (1,  "Megan Dahle",                   "Republican"),
    (2,  "Mike McGuire",                   "Democrat"),
    (3,  "Christopher Cabaldon",           "Democrat"),
    (4,  "Marie Alvarado-Gil",             "Republican"),
    (5,  "Jerry McNerney",                 "Democrat"),
    (6,  "Roger Niello",                   "Republican"),
    (7,  "Jesse Arreguín",                 "Democrat"),
    (8,  "Angelique Ashby",                "Democrat"),
    (9,  "Tim Grayson",                    "Democrat"),
    (10, "Aisha Wahab",                    "Democrat"),
    (11, "Scott Wiener",                   "Democrat"),
    (12, "Shannon Grove",                  "Republican"),
    (13, "Josh Becker",                    "Democrat"),
    (14, "Anna Caballero",                 "Democrat"),
    (15, "Dave Cortese",                   "Democrat"),
    (16, "Melissa Hurtado",                "Democrat"),
    (17, "John Laird",                     "Democrat"),
    (18, "Steve Padilla",                  "Democrat"),
    (19, "Rosilicie Ochoa Bogh",           "Republican"),
    (20, "Caroline Menjivar",              "Democrat"),
    (21, "Monique Limón",                  "Democrat"),
    (22, "Susan Rubio",                    "Democrat"),
    (23, "Suzette Martinez Valladares",    "Republican"),
    (24, "Benjamin Allen",                 "Democrat"),
    (25, "Sasha Renée Pérez",              "Democrat"),
    (26, "Maria Elena Durazo",             "Democrat"),
    (27, "Henry Stern",                    "Democrat"),
    (28, "Lola Smallwood-Cuevas",          "Democrat"),
    (29, "Eloise Gómez Reyes",             "Democrat"),
    (30, "Bob Archuleta",                  "Democrat"),
    (31, "Sabrina Cervantes",              "Democrat"),
    (32, "Kelly Seyarto",                  "Republican"),
    (33, "Lena Gonzalez",                  "Democrat"),
    (34, "Thomas Umberg",                  "Democrat"),
    (35, "Laura Richardson",               "Democrat"),
    (36, "Tony Strickland",                "Republican"),
    (37, "Steven Choi",                    "Republican"),
    (38, "Catherine Blakespear",           "Democrat"),
    (39, "Akilah Weber Pierson",           "Democrat"),
    (40, "Brian W. Jones",                 "Republican"),
]
# fmt: on


def _official_url(chamber: str, district: int, party: str) -> str:
    if chamber == "senate":
        return f"https://sd{district:02d}.senate.ca.gov"
    # Assembly Democrats → asmdc, Republicans → asmrc
    subdomain = "asmdc" if party == "Democrat" else "asmrc"
    return f"https://a{district:02d}.{subdomain}.org"


async def seed_legislators() -> dict:
    created = 0
    updated = 0

    async with async_session() as session:
        for members, chamber in [
            (ASSEMBLY_MEMBERS, "assembly"),
            (SENATE_MEMBERS, "senate"),
        ]:
            for district, name, party in members:
                district_str = str(district)
                result = await session.execute(
                    select(Legislator).where(
                        Legislator.chamber == chamber,
                        Legislator.district == district_str,
                    )
                )
                existing = result.scalar_one_or_none()

                url = _official_url(chamber, district, party)

                if existing:
                    existing.name = name
                    existing.party = party
                    existing.official_website = url
                    updated += 1
                else:
                    session.add(
                        Legislator(
                            name=name,
                            chamber=chamber,
                            district=district_str,
                            party=party,
                            official_website=url,
                        )
                    )
                    created += 1

        await session.commit()

    return {"created": created, "updated": updated, "total": created + updated}


async def main():
    result = await seed_legislators()
    print(
        f"Seed complete: {result['created']} created, {result['updated']} updated, {result['total']} total"
    )


if __name__ == "__main__":
    asyncio.run(main())
