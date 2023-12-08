const mongoose = require('mongoose');
const slugify = require('slugify');


const tourSchema = new mongoose.Schema({
    name:{
        type:String,
        required:[true,'A tour must have a name'],
        unique:true,
        maxLength:[40,'A tour must have less or equal then 40 characters'],
        minLength:[10,'A tour must have more or equal then 10 characters'],
    },
    slug:String,
    duration:{
        type:Number,
        required:[true,'A tour must have a duration'],
    },
    maxGroupSize:{
        type:Number,
        required:[true,'A tour must have a group size'],
    },
    difficulty:{
        type:String,
        required:[true,'A tour must have a difficulty'],
        enum:{
            values:['easy','medium','difficult'],
            message:'Difficulty either easy, medium difficult'
        }
    },
    ratingAverage:{
        type:Number,
        default:4.5,
        min:[1,'Rating must be above 1.0'],
        max:[5,'Rating must be under 5.0'],
        set:val=>Math.round(val*10)/10
    },
    ratingsQuantity:{
        type:Number,
        default:0,
    },price:{
        type:Number,
        required:[true,'A tour must have a price'],
    },
    priceDiscount:{
        type:Number,
        validate:{
            validator:function(val){
                return value<this.price
            }
        }
    },
    summary:{
        type:String,
        trim:true,
        required:[true,'A tour must have a description']
    },description:{
        type:String,
        trim:true,
    },imageCover:{
        type:String,
        required:[true,'A tour must have a cover picture']
    },images:[String],
    createdAt:{
        type:Date,
        default:Date.now()
    },
    startDates:[Date],
    secretTour:{
        type:Boolean,
        default:false
    },
    startLocation: {
        // GeoJSON
        type: {
          type: String,
          default: 'Point',
          enum: ['Point']
        },
        coordinates: [Number],
        address: String,
        description: String
    },
    locations: [
        {
          type: {
            type: String,
            default: 'Point',
            enum: ['Point']
          },
          coordinates: [Number],
          address: String,
          description: String,
          day: Number
        }
    ],
    guides:[
        {
            type:mongoose.Schema.ObjectId,
            ref:'User'
        },
    ]
},
{
    toJSON:{virtuals:true},
    toObject:{virtuals:true}
})

tourSchema.index({price:1,ratingAverage:-1})
tourSchema.index({slug:1})

//virtual property
tourSchema.virtual('durationWeeks').get(function(){
    return this.duration/7
})

//virtual populate  
tourSchema.virtual('reviews',{
    ref:'Review',
    foreignField:'tour',
    localField:'_id'
})

//document middleware: run before save and create
tourSchema.pre('save', function(next){
    this.slug = slugify.default(this.name,{lower:true})
    console.log(this.slug)
    next()
});


// tourSchema.pre('save',async function(next){
//     const guidesPromises = this.guides.map(async id=>await User.findById(id))
//     this.guides = await Promise.all(guidesPromises)//take iterable of promise and return single promise
//     next()
// })

//query middleware
tourSchema.pre(/^find/,function(next){//all string start with find
    this.find({secretTour:{$ne:true}})//find all element which secretTour field not equal to true
    this._startTime = Date.now();
    next()
});

//this middleware to populate 
tourSchema.pre(/^find/,function(next){//all string start with find
    this.populate({
        path:'guides',
        select:'-__v -passwordChangeAt'
    });
      next()
});

//this middleware return run time of query in milisecond
tourSchema.post(/^find/,function(docs,next){//all string start with find
    if (this._startTime != null) {
        console.log('Runtime in MS: ', Date.now() - this._startTime);
    }
    next()
});

// aggregation middleware
tourSchema.pre('aggregate',function(next){
    this.pipeline().unshift({$match:{secretTour:{$ne:true}}})//add to element to beginning of the array
    //this element match all document which have secretTour field not equal to true    
    console.log(this.pipeline())
    next()
})

//create model
const Tour = mongoose.model('Tour',tourSchema)

module.exports = Tour