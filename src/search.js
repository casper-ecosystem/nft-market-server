const admin = require("firebase-admin");
const db = admin.database();
const { sleep, constructFBId } = require('./utils/index.js');
const MiniSearch = require('minisearch')

class Search {

    constructor(opts = {}) {
        // simple in memory search
        this.miniSearch = new MiniSearch({
            fields: ['token_id', 'contract', 'owner', 'name', 'description', 'price', 'listed', 'created'], // fields to index for full-text search
            storeFields: ['token_id', 'contract', 'owner', 'name', 'description', 'image', 'price', 'listed', 'created'] // fields to return with search results
        })

        db.ref('nfts').on('value', this.setDB.bind(this));
    };

    setDB(snap) {
        this.miniSearch.removeAll();
        const docs = Object.entries(snap.val()).map(i => {
            const key = i[0],
                  val = i[1];

            return {
                id: key,
                owner: val?.owner,
                name: val?.metadata?.name,
                description: val?.metadata?.description,
                created: this.getMintedDate(val),
                image: val?.metadata?.image,
                price: val?.listing?.price,
                contract: val?.contract_package_hash,
                token_id: val?.token_id,
                listed: !!val?.listing
            }
        });
        this.miniSearch.addAll(docs);
    }

    async getItem(contract, id) {
        const fbId = constructFBId(contract, id);
        return (await db.ref('nfts').child(fbId).once('value')).val();
    }

    async search(params) {
        if (params?.search) {
            return this.advancedSearch(params.contract, params.search);
        } else {
            return this.miniSearch.search(params.contract);
        }
    }

    advancedSearch(contract, params) {
        let results;

        if (params.text) {
            results = this.miniSearch.search(params.text);
        }

        if (params.buyNow) {
            const r = this.miniSearch.search(contract, {
                filter: (result) => {
                    return result.listed
                }
            })
            results = this.getIntersection(results, r);
        }

        if (params.age) {
            const r = this.miniSearch.search(contract, {
                filter: (result) => {
                    const date = new Date();
                    date.setDate(date.getDate() - params.age)
                    return (new Date(result.created).getTime()) > (date.getTime())
                }
            })
            results = this.getIntersection(results, r);
        }

        if (params.price) {
            const r = this.miniSearch.search(contract, {
                filter: (result) => {
                    return result.price >= params.price.min && result.price <= params.price.max
                }
            })
            results = this.getIntersection(results, r);
        }

        return results.sort((a, b) => b.score - a.score);
    }

    getIntersection(r1, r2) {
        if (r1) {
            return r1.filter(r1_val => r2.some(r2_val => r2_val.id === r1_val.id));
        } else {
            return r2;
        }
    }

    getMintedDate(item) {
        try {
            return Object.values(item.activity).find(a => a.event_type === "cep47_mint_one").timestamp;
        } catch (e) {
            console.log(e);
        }
    }

}

module.exports = Search