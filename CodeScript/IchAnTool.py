"""  IchAnTool """

"""  @autor Santiago Casanova Arenillas """

import numpy as np
import os.path
import csv
from PIL import Image
from datetime import datetime as dt

class core_section():
    def __init__(self, section, top_depth, bottom_depth, units, pix_res,percentage,depth, ii,bi):
            self.section=section
            self.top_depth = top_depth
            self.bottom_depth= bottom_depth
            self.units= units
            self.pix_res= pix_res
            self.percentage=percentage
            self.depth=depth
            self.ii=ii
            self.bi=bi
def open_image(rute, units,bottom_depth,top_depth):
        img_array = np.array(Image.open(rute)) #Should be verticaly oriented
        print("Image size:  " + str(img_array.shape[0])+" x " + str(img_array.shape[1]))
        print ("Img resolution: "+ str(float(img_array.shape[0])/(float(bottom_depth)-float(top_depth))) +" pixels per "+ str(units))
        return img_array
    
def analyze(section,img_array,img_rows,img_columns,top_depth,bottom_depth,units,pix_res,bioturbation_index_tiers,ichnological_index_tiers):
    def grayscale_conversion(img_array,img_rows,img_columns):
            print("Image is in RGB, converting to grayscale...")
            new_img=[]
            for i in range(0,img_rows):
                line=[]
                for j in range(0,img_columns):
                    line.append((int(img_array[i,j,0])*0.3)+(int(img_array[i,j,1])*0.56)+(int(img_array[i,j,2])*0.11))
                     
                new_img.append(line)
            print("Done!")
            return new_img

    def clasification(section,img_array,top_depth,bottom_depth,bioturbation_index_tiers,ichnological_index_tiers,pix_res,img_rows,img_columns):
            print("Calculating bioturbation percentage...")
            percentage_total=[]
            for i in img_array:
                    row_sum=[]
                    for j in i:
                            if j <=5:
                                    row_sum.append(1)
                    percentage_total.append(sum(row_sum)*100/img_columns)
            print("Done!")
            print("Calculating Bioturbation Indexes (Bioturbation Index (bi), Ichnological indexes (ii))...")
            percentage=[]
            depth=[]
            bi=[]
            ii=[]
            cm_lengh= float(bottom_depth) - float(top_depth)
            for i in range(0,img_rows-1):
                    if i % float(pix_res)==0 and i!=0:
                        point_percentage=(sum(percentage_total[i-int(pix_res):i])/(float(pix_res)))
                        percentage.append(point_percentage)
                        depth.append(((((i-(float(pix_res)/2))) * (float(cm_lengh)/img_rows))+float(top_depth)))
                        for j in bioturbation_index_tiers:
                                if point_percentage>=j[0] and point_percentage<j[1]:
                                    bi.append(j[2])
                                    break
                        for j in ichnological_index_tiers:
                                if point_percentage>=j[0] and point_percentage<j[1]:
                                    ii.append(j[2])
                                    break
            print("Done!")
            print("Number of data points: " + str(len(bi)))
            return core_section(section,top_depth, bottom_depth, units, pix_res,percentage,depth, ii,bi)

    if img_array.shape[2]>1:    #converts the image to grayscale if its a RGB jpg
        img_array=grayscale_conversion(img_array,img_rows,img_columns)   
        core_section_aux=clasification(section,img_array,top_depth,bottom_depth,bioturbation_index_tiers,ichnological_index_tiers,pix_res,img_rows,img_columns)
        #clasify the data, obtaining bioturbation percentage and indexes for the resolution introduced by the user
    else:
        core_section_aux=clasification(section,img_array,top_depth,bottom_depth,bioturbation_index_tiers,ichnological_index_tiers,pix_res,img_rows,img_columns)
    return core_section_aux


def progam_loop():         #main flux of the program. it will add points to a dictionary until the user type n, then it will save the dict in a csv
                           #archive in the same folder as the script is saved
        aux1=input("Analyze a core fragment y/n: ")
        while aux1!= 'y' and aux1!='n':
            aux1=input("Please type 'y' or 'n': ")
        loop=0
        while aux1=="y":    #main loop
            loop=loop+1
            section="section_"+str(loop)
            rute= input("Introduce image rute (jpg): ")
            while rute.lower().endswith(('.jpg', '.jpeg'))==False or os.path.isfile(rute)==False:
                print("Incorrect path (not a file or not a jpg), try again!")
                rute=input("Introduce image rute (jpg): ")
            top_depth=  input("Top depth: ")
            bottom_depth= input("Bottom depth: ")
            units= input("Units (cm, m, etc) ")
                                               
            img_array = np.array(open_image(rute, units,bottom_depth,top_depth))    #open the img as an np. array 
            print("Array dimensions: "+ str(img_array.shape) )
            img_rows=img_array.shape[0]
            img_columns=img_array.shape[1] 
            pix_res=input("Pixel resolution (number of pixels in depth to use per data point): ")
            aux2=analyze(section,img_array,img_rows,img_columns,top_depth,bottom_depth,units,pix_res,bioturbation_index_tiers,ichnological_index_tiers)
            core.append(aux2)
            aux1=input("Analyze another core fragment y/n: ")
            while aux1!= 'y' and aux1!='n':
                aux1=input("Please type 'y' or 'n': ")
        date=str(dt.now().strftime("%d-%m-%Y_%Hhours%Mmin"))
        print(date)
        print('Saving as csv in as: bioturvation_of_'+ date + '.csv')
        with open('bioturvation_of_' + date + '.csv', mode='w',newline='') as file:
            fieldnames = ['section','depth', 'bioturbation percentage', 'ii', 'bi']
            writer = csv.DictWriter(file, fieldnames=fieldnames,delimiter=",")
            writer.writerow({'section':'Section','depth':'Depth','bioturbation percentage':'Bioturbation Percentage','ii':'II','bi':'BI'})
            for j in core:   
                for i in range(0,len(j.depth)-1):
                    writer.writerow({'section':str(j.section),'depth':str(j.depth[i]),'bioturbation percentage':str(j.percentage[i]),'ii':str(j.ii[i]),'bi':j.bi[i]})
        print('Done!... when anayzing a new image, remeber to place the csv archive in other folder or it it will be overwritten')

bioturbation_index_tiers= [(0,1,0),(1,5,1),(5,31,2),(31,61,3),(61,91,4),(91,100,5),(100,101,6)] #inicialization of indexes and core.
ichnological_index_tiers= [(0,1,1),(1,10,2),(10,40,3),(40,60,4),(60,100,5),(100,101,6)]
core=[]
progam_loop()




